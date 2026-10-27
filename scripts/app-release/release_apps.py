#!/usr/bin/env python3
"""Check and publish app releases other than zai-codex."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import subprocess
import zipfile
import uuid
import signal

from release_bplayer import run_bplayer
from release_codex_workflow import run_codex
from release_jobs import GO_APPS, FAILURES, history, parallel_prepare, prepare
from release_publish import publish, recover, release_for_manifest
from release_runtime import Runtime, exclusive_lock, write_json
from release_website import publish_website
from release_sources import APPS, changed, clone, discover, provenance, remote_snapshot

OTHER_APPS = tuple(app for app in APPS if app != 'zai-codex')


def configure_site(runtime, site):
    runtime.run(['git', 'config', '--local', 'core.hooksPath', '.githooks'], cwd=site)
    # Fresh isolated clones do not inherit the caller's local author settings.
    runtime.run(['git', 'config', '--local', 'user.name', 'App release automation'], cwd=site)
    runtime.run(['git', 'config', '--local', 'user.email', 'phoenixzqy@users.noreply.github.com'], cwd=site)
    runtime.run(['npm', 'ci'], cwd=site)
    runtime.run(['npx', 'playwright', 'install', 'chromium', 'webkit'], cwd=site)


def detect_tasks(runtime, args, snapshots, site, root):
    tasks, reports = [], []
    revisions = {snapshot['repository']: snapshot['commit'] for snapshot in snapshots}
    for snapshot in snapshots:
        name = snapshot['repository'].split('/')[1]
        app = name.lower()
        runtime.stage = f'{name}:detect'
        journal_path = args.state_dir / f'{app}.json'
        try:
            journal = json.loads(journal_path.read_text()) if journal_path.exists() else {}
            # A shared producer is resolved once so all consumers start from the
            # same immutable dependency snapshot, before any worker starts.
            producers = ('zai-editor', 'zai-gitter', 'zai-design-system') if name == 'zai-cli' else (
                ('zai-design-system',) if name in ('zai-editor', 'zai-gitter') else ())
            snapshot['dependencies'] = {}
            for producer in producers:
                repository = f'{args.owner}/{producer}'
                if repository not in revisions:
                    revisions[repository] = remote_snapshot(runtime, repository)['commit']
                snapshot['dependencies'][repository] = revisions[repository]
            snapshot['site_repository'] = runtime.site_repository
            previous_release = release_for_manifest(runtime, site, app)
            previous = provenance(previous_release['body']) if previous_release else None
            if previous and not previous['dependencies'] and name == 'zai-cli':
                for dependency in snapshot['dependencies']:
                    label = {'zai-editor': 'editor', 'zai-gitter': 'Git viewer', 'zai-design-system': 'design system'}[dependency.split('/')[1]]
                    match = re.search(re.escape(label) + r' `([0-9a-f]{40})`', previous_release['body'])
                    if match:
                        previous['dependencies'][dependency] = match[1]
            pending = bool(journal and not journal.get('complete'))
            if not pending and previous and not changed(snapshot, previous) and not args.force:
                reports.append({'app': name, 'status': 'unchanged', 'snapshot': snapshot})
                runtime.event('No unpublished updates')
                continue
            if not args.publish:
                reports.append({'app': name, 'status': 'pending-recovery' if pending else 'update', 'snapshot': snapshot})
                runtime.event('Would recover publication' if pending else 'Would build and release')
                continue
            if pending and (journal['app'] != app or journal['snapshot']['repository'] != snapshot['repository']):
                raise ValueError('Journal identity mismatch')
            resumable = pending and (journal.get('create_intent') or
                        (app in ('bplayer', 'zai-codex') and (journal.get('dispatch_intent') or journal.get('run_id'))))
            if not resumable:
                journal = {'app': app, 'snapshot': snapshot, 'complete': False}
            tasks.append({'name': name, 'snapshot': journal['snapshot'], 'journal': journal,
                          'pending': bool(resumable), 'journal_path': journal_path,
                          'output': root / f'{app}-assets'})
        except FAILURES as error:
            reports.append({'app': name, 'status': 'failed', 'stage': runtime.stage, 'error': str(error)})
    return tasks, reports


def restore_codex_installer(runtime, args, task, root, site):
    source = clone(runtime, task['snapshot'], args.workspace, root, recovery=True)
    runtime.run(['node', 'scripts/sync-zai-codex-installer.mjs', source, '--release'], cwd=site)
    runtime.run(['npm', 'run', 'build:installers'], cwd=site)


def outcome(task, error=None, stage=None):
    if error:
        return {'app': task['name'], 'status': 'failed', 'stage': stage, 'error': str(error)}
    return {'app': task['name'], 'status': 'superseded' if task['journal'].get('superseded') else 'released',
            'journal': str(task['journal_path'])}


def process(runtime, args, root):
    runtime.site_repository = f'{args.owner}/phoenixzqy.github.io'
    if args.publish:
        settings = json.loads(runtime.run(['go', 'env', '-json', 'GOPRIVATE', 'GONOSUMDB', 'GONOPROXY']))
        for key, value in settings.items():
            runtime.environment[key] = ','.join(dict.fromkeys([*filter(None, value.split(',')), f'github.com/{args.owner}/*']))
    site_snapshot = remote_snapshot(runtime, runtime.site_repository)
    runtime.site_branch = site_snapshot['branch']
    snapshots = discover(runtime, args.owner, args.apps or args.allowed_apps)
    site = clone(runtime, site_snapshot, args.workspace, root)
    tasks, reports = detect_tasks(runtime, args, snapshots, site, root)
    if not tasks:
        return reports
    configure_site(runtime, site)
    # Recovery and native/workflow releases remain serialized. Only fresh Go
    # builds are independent and never write to the shared site checkout.
    go_tasks = [task for task in tasks if task['name'] in GO_APPS and not task['pending']]
    prepared = parallel_prepare(runtime, args, go_tasks, root, site)
    batch, queued = [], []
    for task in go_tasks:
        result = prepared[task['name']]
        if 'error' in result:
            reports.append(outcome(task, result['error'], result['stage']))
            continue
        try:
            publish(runtime, task['snapshot'], result['data'], task['output'], site,
                    task['journal_path'], task['journal'], batch=batch)
            if task['journal'].get('complete'):
                reports.append(outcome(task))
            else:
                queued.append(task)
        except FAILURES as error:
            reports.append(outcome(task, error, runtime.stage))
    if batch:
        try:
            publish_website(runtime, site, batch)
            reports.extend(outcome(task) for task in queued)
        except FAILURES as error:
            reports.extend(outcome(task) if task['journal'].get('complete') else
                           outcome(task, error, runtime.stage) for task in queued)
            # Site conflict/dirty state cannot contaminate a subsequent release.
            reports.extend({'app': task['name'], 'status': 'failed', 'stage': 'website:batch',
                            'error': 'Deferred because the combined website publication failed'}
                           for task in tasks if task not in go_tasks)
            return reports
    for task in tasks:
        if task in go_tasks:
            continue
        runtime.stage = f'{task["name"]}:release'
        try:
            if task['name'] == 'BPlayer':
                write_json(task['journal_path'], task['journal'])
                run_bplayer(runtime, task['snapshot'], site, task['journal_path'], task['journal'], task['output'])
            elif task['name'] == 'zai-codex' and not task['journal'].get('create_intent'):
                write_json(task['journal_path'], task['journal'])
                run_codex(runtime, args, task, root, site)
            elif task['pending']:
                recover(runtime, site, task['journal_path'], task['journal'], task['output'],
                        lambda: prepare(runtime, args, task, root, site),
                        restore_installer=(lambda: restore_codex_installer(runtime, args, task, root, site))
                        if task['name'] == 'zai-codex' else None)
            else:
                data = prepare(runtime, args, task, root, site)
                publish(runtime, task['snapshot'], data, task['output'], site, task['journal_path'], task['journal'])
            reports.append(outcome(task))
        except FAILURES as error:
            reports.append(outcome(task, error, runtime.stage))
            if runtime.run(['git', 'status', '--porcelain'], cwd=site):
                remaining = tasks[tasks.index(task) + 1:]
                reports.extend({'app': item['name'], 'status': 'failed', 'stage': runtime.stage,
                                'error': 'Deferred because the site checkout needs recovery'}
                               for item in remaining if item not in go_tasks)
                break
    return reports


def main(argv=None, *, allowed_apps=OTHER_APPS):
    description = 'Check and publish zai-codex releases.' if allowed_apps == ('zai-codex',) else __doc__
    parser = argparse.ArgumentParser(description=description)
    parser.set_defaults(allowed_apps=allowed_apps, publish=False)
    parser.add_argument('--jobs', type=int, choices=(1, 2, 3), default=2,
                        help='Concurrent Go validation/build jobs (default: 2). Publishing is serialized.')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--publish', action='store_true', help='Build and publish; default is read-only detection.')
    mode.add_argument('--dry-run', action='store_false', dest='publish',
                      help='Detect updates without building or publishing (default).')
    parser.add_argument('--force', action='store_true', help='Release selected apps even when already current.')
    parser.add_argument('--apps', nargs='+', choices=allowed_apps,
                        help='Limit releases within this script\'s app group.')
    parser.add_argument('--owner', default='phoenixzqy')
    parser.add_argument('--workspace', type=Path, default=Path.home() / 'workspace')
    parser.add_argument('--state-dir', type=Path, default=Path.home() / '.local/state/app-release')
    parser.add_argument('--codex-notices', type=Path, help='Legacy native recovery notice directory; new Codex releases use the workflow notice pin.')
    parser.add_argument('--timeout', type=int, default=7200, help='Maximum seconds per build/workflow.')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*', args.owner) or args.timeout <= 0:
        parser.error('Invalid owner or timeout')
    if args.force and not args.apps:
        parser.error('--force requires explicit --apps')
    args.state_dir = args.state_dir.expanduser().resolve()
    args.workspace = args.workspace.expanduser().resolve()
    if args.codex_notices:
        args.codex_notices = args.codex_notices.expanduser().resolve()
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8]
    runtime = Runtime(args.state_dir / 'runs' / run_id, args.timeout)
    report = {'run_id': run_id, 'publish': args.publish, 'apps': []}
    previous_term = signal.getsignal(signal.SIGTERM)
    def interrupt(_signal, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupt)
    try:
        with exclusive_lock(args.state_dir / 'release.lock'):
            # Sandboxes allow TMPDIR writes; source staging must stay outside
            # that grant so validation can exercise filesystem boundaries.
            with tempfile.TemporaryDirectory(prefix='app-release-') as temporary, \
                    tempfile.TemporaryDirectory(prefix='t-') as child_temporary:
                runtime.environment.update({key: child_temporary for key in ('TMPDIR', 'TMP', 'TEMP')})
                report['apps'] = process(runtime, args, Path(temporary))
        return_code = int(any(app['status'] == 'failed' for app in report['apps']))
    except (OSError, ValueError, RuntimeError, KeyError, zipfile.BadZipFile, subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        report['error'] = str(error)
        return_code = 130 if isinstance(error, KeyboardInterrupt) else 1
        runtime.event(f'FAILED: {error}')
    finally:
        signal.signal(signal.SIGTERM, previous_term)
    report['exit_code'] = return_code
    write_json(runtime.directory / 'summary.json', report)
    print(f'Report: {runtime.directory / "summary.json"}', flush=True)
    return return_code


if __name__ == '__main__':
    raise SystemExit(main())

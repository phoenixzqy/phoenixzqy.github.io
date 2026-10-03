#!/usr/bin/env python3
"""Check remote app revisions; build, verify and publish approved app releases."""
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

from release_bplayer import run_bplayer
from release_builds import allocate, build, refresh_dependencies
from release_publish import publish, recover, release_for_manifest
from release_runtime import Runtime, exclusive_lock, write_json
from release_sources import APPS, changed, clone, discover, provenance, remote_snapshot


def dependencies(runtime, owner, name):
    # Track bundled producers even when their own release is excluded.
    names = ('zai-editor', 'zai-gitter', 'zai-design-system') if name == 'zai-cli' else (
        ('zai-design-system',) if name in ('zai-editor', 'zai-gitter') else ())
    return {f'{owner}/{dependency}': remote_snapshot(runtime, f'{owner}/{dependency}')['commit']
            for dependency in names}


def history(runtime, repository):
    tags = [item['name'] for item in runtime.pages(f'repos/{repository}/tags?per_page=100')]
    tags += [item['tag_name'] for item in runtime.pages(f'repos/{repository}/releases?per_page=100')]
    return tags


def configure_site(runtime, site):
    runtime.run(['git', 'config', '--local', 'core.hooksPath', '.githooks'], cwd=site)
    # Fresh isolated clones do not inherit the caller's local author settings.
    runtime.run(['git', 'config', '--local', 'user.name', 'App release automation'], cwd=site)
    runtime.run(['git', 'config', '--local', 'user.email', 'phoenixzqy@users.noreply.github.com'], cwd=site)
    runtime.run(['npm', 'ci'], cwd=site)
    runtime.run(['npx', 'playwright', 'install', 'chromium', 'webkit'], cwd=site)


def process(runtime, args, root):
    runtime.site_repository = f'{args.owner}/phoenixzqy.github.io'
    if args.publish:
        settings = json.loads(runtime.run(['go', 'env', '-json', 'GOPRIVATE', 'GONOSUMDB', 'GONOPROXY']))
        for key, value in settings.items():
            runtime.environment[key] = ','.join(dict.fromkeys([*filter(None, value.split(',')), f'github.com/{args.owner}/*']))
    site_snapshot = remote_snapshot(runtime, runtime.site_repository)
    runtime.site_branch = site_snapshot['branch']
    snapshots = discover(runtime, args.owner, args.apps)
    site = clone(runtime, site_snapshot, args.workspace, root)
    reports = []
    configured_site = False
    for snapshot in snapshots:
        name = snapshot['repository'].split('/')[1]
        app = name.lower()
        runtime.stage = f'{name}:detect'
        journal_path = args.state_dir / f'{app}.json'
        journal = json.loads(journal_path.read_text()) if journal_path.exists() else {}
        try:
            snapshot['dependencies'] = dependencies(runtime, args.owner, name)
            snapshot['site_repository'] = runtime.site_repository
            previous_release = release_for_manifest(runtime, site, app)
            previous = provenance(previous_release['body']) if previous_release else None
            # Legacy release notes record bundled CLI revisions explicitly.
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
            if not configured_site:
                configure_site(runtime, site)
                configured_site = True
            output = root / f'{app}-assets'
            if pending:
                if journal['app'] != app or journal['snapshot']['repository'] != snapshot['repository']:
                    raise ValueError('Journal identity mismatch')
                if app == 'bplayer' and (journal.get('dispatch_intent') or journal.get('run_id')):
                    run_bplayer(runtime, journal['snapshot'], site, journal_path, journal, output)
                elif journal.get('create_intent'):
                    def rebuild_interrupted():
                        recorded = journal['snapshot']
                        source = clone(runtime, recorded, args.workspace, root)
                        refresh_dependencies(runtime, source, recorded)
                        if name in ('zai-editor', 'zai-gitter'):
                            module = f'github.com/{args.owner}/zai-design-system'
                            runtime.run(['go', 'get', f'{module}@{recorded["dependencies"][f"{args.owner}/zai-design-system"]}'], cwd=source)
                            runtime.run(['go', 'mod', 'tidy'], cwd=source)
                        build(runtime, source, recorded, journal['version'], output, site, args.codex_notices)
                    recover(runtime, site, journal_path, journal, output, rebuild_interrupted)
                else:
                    # No external write occurred: discard the old local attempt.
                    pending = False
            if not pending:
                journal = {'app': app, 'snapshot': snapshot, 'complete': False}
                if app == 'bplayer':
                    write_json(journal_path, journal)
                    run_bplayer(runtime, snapshot, site, journal_path, journal, output)
                else:
                    source = clone(runtime, snapshot, args.workspace, root)
                    refresh_dependencies(runtime, source, snapshot)
                    # Resolve the tools' shared dependency through native tooling.
                    if name in ('zai-editor', 'zai-gitter'):
                        module = f'github.com/{args.owner}/zai-design-system'
                        runtime.run(['go', 'get', f'{module}@{snapshot["dependencies"][f"{args.owner}/zai-design-system"]}'], cwd=source)
                        runtime.run(['go', 'mod', 'tidy'], cwd=source)
                    versions = history(runtime, snapshot['repository']) + history(runtime, runtime.site_repository)
                    version = allocate(runtime, source, name, versions)
                    journal.update(version=version, tag=f'{app}-v{version}')
                    data = build(runtime, source, snapshot, version, output, site, args.codex_notices)
                    journal['manifest'] = data
                    write_json(journal_path, journal)
                    # A newer remote release allocated while we built is a real collision.
                    if journal['tag'] in history(runtime, runtime.site_repository):
                        raise RuntimeError('Version/tag allocated concurrently; retry before publication')
                    publish(runtime, snapshot, data, output, site, journal_path, journal)
            reports.append({'app': name, 'status': 'superseded' if journal.get('superseded') else 'released', 'journal': str(journal_path)})
        except (OSError, ValueError, RuntimeError, KeyError, zipfile.BadZipFile, subprocess.TimeoutExpired) as error:
            runtime.event(f'FAILED: {error}')
            reports.append({'app': name, 'status': 'failed', 'stage': runtime.stage, 'error': str(error)})
            # Installer changes/conflicts from a failed app must not contaminate
            # another release commit. Stop, report, and reconcile on the next run.
            if runtime.run(['git', 'status', '--porcelain'], cwd=site):
                break
    return reports


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true', help='Build and publish; default is read-only detection.')
    parser.add_argument('--force', action='store_true', help='Release selected apps even when already current.')
    parser.add_argument('--apps', nargs='+', choices=APPS)
    parser.add_argument('--owner', default='phoenixzqy')
    parser.add_argument('--workspace', type=Path, default=Path.home() / 'workspace')
    parser.add_argument('--state-dir', type=Path, default=Path.home() / '.local/state/app-release')
    parser.add_argument('--codex-notices', type=Path, help='Previously reviewed third-party notice directory.')
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
    try:
        with exclusive_lock(args.state_dir / 'release.lock'):
            with tempfile.TemporaryDirectory(prefix='app-release-') as temporary:
                report['apps'] = process(runtime, args, Path(temporary))
        return_code = int(any(app['status'] == 'failed' for app in report['apps']))
    except (OSError, ValueError, RuntimeError, KeyError, zipfile.BadZipFile, subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        report['error'] = str(error)
        return_code = 130 if isinstance(error, KeyboardInterrupt) else 1
        runtime.event(f'FAILED: {error}')
    report['exit_code'] = return_code
    write_json(runtime.directory / 'summary.json', report)
    print(f'Report: {runtime.directory / "summary.json"}', flush=True)
    return return_code


if __name__ == '__main__':
    raise SystemExit(main())

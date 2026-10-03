"""Dispatch and track the remote-default-branch BPlayer release workflow."""
from __future__ import annotations

import base64
import json
import time
import uuid
from urllib.parse import quote

from release_packages import download
from release_publish import release_for_manifest, verify_pages
from release_runtime import timestamp, write_json
from release_sources import provenance, remote_snapshot


def run_bplayer(runtime, snapshot, site, journal_path, journal, output):
    if not journal.get('dispatch_intent'):
        snapshot.update(remote_snapshot(runtime, snapshot['repository']))
        journal['snapshot'] = snapshot
    repository, branch = snapshot['repository'], snapshot['branch']
    workflow = runtime.api(f'repos/{repository}/contents/.github/workflows/release.yml?ref={quote(snapshot["commit"], safe="")}')
    content = base64.b64decode(workflow['content']).decode()
    if ('release_artifacts.py check' not in content or 'release_artifacts.py prepare-aab' not in content or
            'automation_request_id' not in content):
        raise RuntimeError('BPlayer remote default branch lacks debug-artifact sanitization; merge the root workflow fix first')
    workflow_path = 'release.yml'
    endpoint = f'repos/{repository}/actions/workflows/{workflow_path}'
    if not journal.get('run_id'):
        runs = runtime.api(f'{endpoint}/runs?per_page=100')['workflow_runs']
        if not journal.get('dispatch_intent') and any(run['status'] != 'completed' for run in runs):
            raise RuntimeError('A BPlayer release is already active; retry after it finishes')
        if journal.get('dispatch_intent'):
            old_ids = journal['before_run_ids']
        else:
            old_ids = [run['id'] for run in runs]
            journal.update(dispatch_intent=True, before_run_ids=old_ids, request_id=uuid.uuid4().hex)
            write_json(journal_path, journal)
            runtime.run(['gh', 'api', '--method', 'POST', f'{endpoint}/dispatches', '-f', f'ref={branch}',
                         '-f', f'inputs[automation_request_id]={journal["request_id"]}'])
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            runs = runtime.api(f'{endpoint}/runs?per_page=100')['workflow_runs']
            candidates = [r for r in runs if r['id'] not in old_ids and
                          r['event'] == 'workflow_dispatch' and
                          r['display_title'] == f'Release {journal["request_id"]}']
            if len(candidates) > 1:
                raise RuntimeError('Ambiguous BPlayer dispatch; inspect run IDs, do not dispatch again')
            if candidates:
                journal['run_id'] = candidates[0]['id']
                # Dispatch resolves the moving default branch at GitHub, not at
                # discovery time. The unique title identifies the actual run.
                snapshot['commit'] = candidates[0]['head_sha']
                journal['snapshot'] = snapshot
                write_json(journal_path, journal)
                break
            time.sleep(5)
        else:
            raise RuntimeError('BPlayer dispatch was not identified; dispatch intent retained to prevent duplicate releases')
    runtime.stage = 'BPlayer:workflow'
    deadline = time.monotonic() + runtime.timeout
    while time.monotonic() < deadline:
        run = runtime.api(f'repos/{repository}/actions/runs/{journal["run_id"]}')
        if run['status'] == 'completed':
            journal['workflow_terminal'] = {
                'run_id': journal['run_id'],
                'run_attempt': run.get('run_attempt'),
                'conclusion': run['conclusion'],
                'url': run.get('html_url'),
                'observed_at': timestamp(),
            }
            write_json(journal_path, journal)
            if run['conclusion'] != 'success':
                raise RuntimeError(f'BPlayer release {run["html_url"]} concluded {run["conclusion"]}; '
                                   f'terminal result recorded in {journal_path}. Reconcile published assets '
                                   'before resuming or retiring this attempt; see scripts/app-release/README.md')
            break
        time.sleep(15)
    else:
        raise RuntimeError('BPlayer workflow timed out; remote run remains active, journal retained')
    runtime.run(['git', 'fetch', 'origin', runtime.site_branch], cwd=site)
    runtime.run(['git', 'merge', '--ff-only', f'origin/{runtime.site_branch}'], cwd=site)
    release = release_for_manifest(runtime, site, 'bplayer')
    if provenance(release['body'])['commit'] != snapshot['commit']:
        raise RuntimeError('BPlayer workflow did not publish the detected source revision')
    data = json.loads((site / 'releases/bplayer/latest/manifest.json').read_text())
    output.mkdir(parents=True)
    for asset in data['release']['assets']:
        download(asset, output)
    verify_pages(runtime, site, 'bplayer', data)
    journal['complete'] = True
    write_json(journal_path, journal)

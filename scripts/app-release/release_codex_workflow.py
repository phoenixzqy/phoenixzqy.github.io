"""Dispatch native Codex builds and publish verified source-release links."""
import json
import time
import uuid
from urllib.parse import quote
import zipfile

from release_builds import allocate
from release_jobs import history
from release_packages import download
from release_runtime import write_json
from release_sources import clone, provenance
from release_website import publish_website

TARGETS = {
    'x86_64-unknown-linux-gnu': ('linux', 'x64'),
    'aarch64-unknown-linux-gnu': ('linux', 'arm64'),
    'x86_64-apple-darwin': ('macos', 'x64'),
    'aarch64-apple-darwin': ('macos', 'arm64'),
    'x86_64-pc-windows-msvc': ('windows', 'x64'),
    'aarch64-pc-windows-msvc': ('windows', 'arm64'),
}


def verify_manifest(data, snapshot, version, release):
    repository = snapshot['repository']
    if (data.get('schemaVersion') != 1 or data.get('appId') != 'zai-codex' or
            data.get('sourceCommit') != snapshot['commit'] or data['release']['version'] != version or
            release['draft'] or release['tag_name'] != f'zai-codex-v{version}' or
            provenance(release['body'])['commit'] != snapshot['commit']):
        raise ValueError('Codex workflow release identity/provenance mismatch')
    assets = data['release']['assets']
    expected = {f'zai-codex-{version}-{target}.zip': pair for target, pair in TARGETS.items()}
    if len(assets) != len(expected) or {a['file'] for a in assets} != set(expected):
        raise ValueError('Codex release requires all six native packages')
    published = {a['name']: a for a in release['assets']}
    for asset in assets:
        url = f'https://github.com/{repository}/releases/download/zai-codex-v{version}/{asset["file"]}'
        if ((asset['platform'], asset['architecture']) != expected[asset['file']] or
                asset['url'] != url or asset['signing'] != 'unsigned' or
                published.get(asset['file'], {}).get('browser_download_url') != url or
                published[asset['file']]['size'] != asset['bytes']):
            raise ValueError('Codex workflow asset identity mismatch')
    return data


def workflow_run(runtime, snapshot, journal_path, journal, source):
    endpoint = f'repos/{snapshot["repository"]}/actions/workflows/zai-codex-release.yml'
    if not journal.get('run_id'):
        runs = runtime.api(f'{endpoint}/runs?per_page=100')['workflow_runs']
        if not journal.get('dispatch_intent'):
            if any(run['status'] != 'completed' for run in runs):
                raise RuntimeError('A Codex release is already active; retry after it finishes')
            versions = history(runtime, snapshot['repository']) + history(runtime, runtime.site_repository)
            version = allocate(runtime, source, 'zai-codex', versions)
            journal.update(version=version, tag=f'zai-codex-v{version}', dispatch_intent=True,
                           before_run_ids=[r['id'] for r in runs], request_id=uuid.uuid4().hex)
            write_json(journal_path, journal)
            # Save intent first: uncertain dispatch responses must never be retried blindly.
            runtime.run(['gh', 'api', '--method', 'POST', f'{endpoint}/dispatches',
                         '-f', f'ref={snapshot["branch"]}', '-f', f'inputs[version]={version}',
                         '-f', f'inputs[source_commit]={snapshot["commit"]}',
                         '-f', f'inputs[automation_request_id]={journal["request_id"]}'])
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            runs = runtime.api(f'{endpoint}/runs?per_page=100')['workflow_runs']
            candidates = [r for r in runs if r['id'] not in journal['before_run_ids'] and
                          r['event'] == 'workflow_dispatch' and
                          r['display_title'] == f'zai-codex release {journal["request_id"]}']
            if len(candidates) > 1:
                raise RuntimeError('Ambiguous Codex dispatch; inspect runs without dispatching again')
            if candidates:
                run = candidates[0]
                if run['head_sha'] != snapshot['commit'] or run['head_branch'] != snapshot['branch']:
                    raise ValueError('Codex dispatch resolved a different source revision')
                journal['run_id'] = run['id']
                write_json(journal_path, journal)
                break
            time.sleep(5)
        else:
            raise RuntimeError('Codex dispatch not identified; intent retained to prevent duplicate releases')
    deadline = time.monotonic() + runtime.timeout
    while time.monotonic() < deadline:
        run = runtime.api(f'repos/{snapshot["repository"]}/actions/runs/{journal["run_id"]}')
        if run['head_sha'] != snapshot['commit'] or run['head_branch'] != snapshot['branch']:
            raise ValueError('Stored Codex workflow run has different source provenance')
        if run['status'] == 'completed':
            journal['workflow_terminal'] = {key: run.get(key) for key in ('id', 'run_attempt', 'conclusion', 'html_url')}
            write_json(journal_path, journal)
            if run['conclusion'] != 'success':
                raise RuntimeError(f'Codex release {run["html_url"]} concluded {run["conclusion"]}; '
                                   'inspect the run and any draft before resuming; no redispatch was attempted')
            return
        time.sleep(15)
    raise RuntimeError('Codex workflow timed out; remote run remains active and journal retained')


def run_codex(runtime, args, task, root, site):
    snapshot, journal = task['snapshot'], task['journal']
    if snapshot['repository'] != 'phoenixzqy/zai-codex' or snapshot['branch'] != 'zai-codex':
        raise ValueError('Codex release requires the authoritative customization default branch')
    runtime.stage = 'zai-codex:workflow'
    source = clone(runtime, snapshot, args.workspace, root, recovery=task['pending'])
    workflow_run(runtime, snapshot, task['journal_path'], journal, source)
    tag = journal['tag']
    release = runtime.api(f'repos/{snapshot["repository"]}/releases/tags/{quote(tag, safe="")}')
    output = task['output']
    output.mkdir(parents=True, exist_ok=True)
    runtime.run(['gh', 'release', 'download', tag, '--repo', snapshot['repository'],
                 '--dir', output, '--pattern', 'manifest.json'])
    data = verify_manifest(json.loads((output / 'manifest.json').read_text()), snapshot, journal['version'], release)
    for asset in data['release']['assets']:
        package = download(asset, output)
        with zipfile.ZipFile(package) as archive:
            record = json.loads(archive.read('zai-release.json'))
            target = next(target for target in TARGETS if asset['file'] == f'zai-codex-{journal["version"]}-{target}.zip')
            metadata = json.loads(archive.read('codex-package.json'))
            if (record != {'repository': snapshot['repository'], 'branch': snapshot['branch'],
                           'commit': snapshot['commit'], 'version': journal['version'], 'tag': tag} or
                    metadata['target'] != target):
                raise ValueError('Downloaded Codex bundle provenance/target mismatch')
    runtime.run(['node', 'scripts/sync-zai-codex-installer.mjs', source, '--release'], cwd=site)
    runtime.run(['npm', 'run', 'build:installers'], cwd=site)
    from release_notices import notices_text
    journal['manifest'] = data
    write_json(task['journal_path'], journal)
    publish_website(runtime, site, [{'data': data, 'notices': notices_text(data, output, snapshot['commit']),
                                    'journal': journal, 'journal_path': task['journal_path']}])

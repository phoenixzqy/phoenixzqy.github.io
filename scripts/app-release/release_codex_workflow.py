"""Dispatch native Codex builds and publish verified source-release links."""
import json
from urllib.parse import quote
import zipfile

from release_packages import download
from release_runtime import write_json
from release_sources import clone, provenance
from release_website import publish_website
from release_workflow import workflow_run as dispatch_workflow

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
    return dispatch_workflow(runtime, snapshot, journal_path, journal, source,
                             app='zai-codex', workflow='zai-codex-release.yml')


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

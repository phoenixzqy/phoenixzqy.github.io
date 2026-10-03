"""Publish verified artifacts, resume interrupted publication and gate site pushes."""
from __future__ import annotations

import json
from pathlib import Path
import re
import time

from release_packages import download, verify_file
from release_runtime import timestamp, write_json
from release_sources import provenance


def release_for_manifest(runtime, site, app):
    manifest_path = site / f'releases/{app}/latest/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    if manifest['release'] is None:
        return None
    version = manifest['release']['version']
    return runtime.api(f'repos/{runtime.site_repository}/releases/tags/{app}-v{version}')


def validate_metadata(runtime, site, data):
    catalog = json.loads((site / 'apps/catalog.json').read_text())
    apps = catalog if isinstance(catalog, list) else catalog['apps']
    if data['appId'] not in {app['id'] for app in apps}:
        raise ValueError('App is not approved in the public catalog')
    path = site / f'releases/{data["appId"]}/latest/manifest.json'
    previous = path.read_bytes()
    try:
        path.write_text(json.dumps(data, indent=2) + '\n')
        runtime.run(['npm', 'run', 'validate:apps'], cwd=site)
    finally:
        path.write_bytes(previous)


def publish(runtime, snapshot, data, output, site, journal_path, journal):
    name = data['appId']
    version = data['release']['version']
    tag = f'{name}-v{version}'
    repository = runtime.site_repository
    runtime.stage = f'{name}:publish'
    validate_metadata(runtime, site, data)
    if not journal.get('release_id'):
        target = runtime.run(['git', 'rev-parse', 'HEAD'], cwd=site)
        note = output / 'release-notes.md'
        record = {key: snapshot[key] for key in ('repository', 'branch', 'commit', 'dependencies')}
        note.write_text(f'Unsigned preview built from source revision `{snapshot["commit"]}`.\n\n'
                        'Final archives exclude debug maps and separate debug companions. '
                        'Native validation passed on the build host; cross-compilation does not '
                        'establish native behavior on other hosts.\n\n'
                        f'<!-- app-release-provenance {json.dumps(record, sort_keys=True)} -->\n')
        # Record intent BEFORE the irreversible release create: a lost API response
        # is reconciled by tag and exact provenance on the next invocation.
        journal['create_intent'] = True
        write_json(journal_path, journal)
        runtime.run(['gh', 'release', 'create', tag, '--repo', repository, '--target', target,
                     '--draft', '--prerelease', '--title', f'{name} {version}', '--notes-file', note])
        release = runtime.api(f'repos/{repository}/releases/tags/{tag}')
        journal['release_id'] = release['id']
        write_json(journal_path, journal)
    for asset in data['release']['assets']:
        verify_file(output / asset['file'], asset)
    runtime.run(['gh', 'release', 'upload', tag, '--repo', repository,
                 *[output / a['file'] for a in data['release']['assets']]])
    journal['uploaded'] = True
    write_json(journal_path, journal)
    finish(runtime, data, output, site, journal_path, journal)


def recover(runtime, site, journal_path, journal, output):
    runtime.stage = f'{journal["app"]}:recover'
    repository, tag = runtime.site_repository, journal['tag']
    release = runtime.api(f'repos/{repository}/releases/tags/{tag}')
    record = provenance(release['body'])
    if record['commit'] != journal['snapshot']['commit'] or record.get('dependencies', {}) != journal['snapshot']['dependencies']:
        raise ValueError('Release tag ownership/provenance differs from the interrupted journal')
    journal['release_id'] = release['id']
    data = journal['manifest']
    if data['appId'] == 'zai-codex':
        raise RuntimeError('Interrupted codex release requires its installer synchronization to be restored; '
                           f'inspect {journal_path} before resuming')
    output.mkdir(parents=True)
    # Never overwrite partial draft assets with different freshly rebuilt bytes.
    runtime.run(['gh', 'release', 'download', tag, '--repo', repository, '--dir', output,
                 *[arg for a in data['release']['assets'] for arg in ('--pattern', a['file'])]])
    for asset in data['release']['assets']:
        verify_file(output / asset['file'], asset)
    finish(runtime, data, output, site, journal_path, journal)


def version_key(version):
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?', version)
    if not match:
        raise ValueError(f'Unsupported publication version: {version}')
    return tuple(int(item or 0) for item in match.groups())


def reconcile_latest(current, intended):
    if current['release'] is None:
        return 'publish'
    current_version = version_key(current['release']['version'])
    intended_version = version_key(intended['release']['version'])
    if current_version > intended_version:
        return 'superseded'
    if current_version == intended_version and current != intended:
        raise ValueError('Current version has different metadata/bytes; never overwrite a published version')
    return 'identical' if current == intended else 'publish'


def finish(runtime, data, output, site, journal_path, journal):
    name, repository = data['appId'], runtime.site_repository
    tag = journal['tag']
    runtime.run(['git', 'fetch', 'origin', runtime.site_branch], cwd=site)
    current = json.loads(runtime.run(['git', 'show', f'origin/{runtime.site_branch}:releases/{name}/latest/manifest.json'], cwd=site))
    disposition = reconcile_latest(current, data)
    if disposition == 'superseded':
        journal.update(complete=True, superseded=True)
        write_json(journal_path, journal)
        runtime.event('Interrupted publication superseded by a newer remote release')
        return
    release = runtime.api(f'repos/{repository}/releases/tags/{tag}')
    if release['draft']:
        runtime.run(['gh', 'release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease'])
    runtime.stage = f'{name}:public-downloads'
    downloaded = output / 'public-downloads'
    downloaded.mkdir(exist_ok=True)
    for asset in data['release']['assets']:
        download(asset, downloaded)
    runtime.stage = f'{name}:website'
    path = site / f'releases/{name}/latest/manifest.json'
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    runtime.run(['npm', 'run', 'validate:apps'], cwd=site)
    runtime.run(['git', 'add', str(path)], cwd=site)
    if name == 'zai-codex':
        runtime.run(['git', 'add', 'install/templates/zai-codex.py.in', 'install/zai-codex-source.json',
                     'install/zai-codex.sh', 'install/zai-codex.ps1'], cwd=site)
    if runtime.run(['git', 'diff', '--cached', '--name-only'], cwd=site):
        runtime.run(['git', 'commit', '-m', f'Publish {name} {data["release"]["version"]}'], cwd=site)
    for attempt in range(3):
        runtime.run(['git', 'fetch', 'origin', runtime.site_branch], cwd=site)
        runtime.run(['git', 'rebase', f'origin/{runtime.site_branch}'], cwd=site)
        runtime.run(['npm', 'run', 'validate:apps'], cwd=site)
        # Installed pre-push hook runs the full website test suite each attempt.
        try:
            runtime.run(['git', 'push', 'origin', f'HEAD:refs/heads/{runtime.site_branch}'], cwd=site)
            break
        except RuntimeError:
            if attempt == 2:
                raise
    journal['website_commit'] = runtime.run(['git', 'rev-parse', 'HEAD'], cwd=site)
    write_json(journal_path, journal)
    verify_pages(runtime, site, name, data)
    journal['complete'] = True
    write_json(journal_path, journal)


def verify_pages(runtime, site, name, data):
    from release_packages import HTTPSOnly
    import urllib.request
    runtime.stage = f'{name}:pages'
    deadline = time.monotonic() + 1200
    # Verify the actual deployed manifest; a green older deployment is insufficient.
    while time.monotonic() < deadline:
        try:
            url = f'https://phoenixzqy.github.io/releases/{name}/latest/manifest.json'
            request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
            with urllib.request.build_opener(HTTPSOnly()).open(request, timeout=30) as response:
                public = json.load(response)
            if public == data:
                return
        except (OSError, ValueError):
            pass
        time.sleep(10)
    raise RuntimeError('Website publication did not become publicly available within 20 minutes')

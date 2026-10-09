"""Publish verified artifacts, resume interrupted publication and gate site pushes."""
from __future__ import annotations

import json
from pathlib import Path
import re
import time

from release_packages import download, verify_file
from release_runtime import timestamp, write_json
from release_sources import provenance


def release_by_tag(runtime, tag, release_id=None):
    if release_id is not None:
        release = runtime.api(f'repos/{runtime.site_repository}/releases/{release_id}')
        if release['tag_name'] != tag:
            raise ValueError('Stored release ID belongs to a different tag')
        return release
    # GitHub's by-tag endpoint can omit an unpublished draft. The authenticated
    # release collection includes drafts even before their Git tag exists.
    matches = [release for release in runtime.pages(f'repos/{runtime.site_repository}/releases?per_page=100')
               if release['tag_name'] == tag]
    if len(matches) != 1:
        raise ValueError(f'Expected one owned release for {tag}; found {len(matches)}')
    return matches[0]


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


def publish(runtime, snapshot, data, output, site, journal_path, journal, batch=None):
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
        validation = ('Native build and package smoke checks passed on the build host. '
                      'Release automation did not rerun the full source test suite. '
                      if name == 'zai-codex' else 'Native validation passed on the build host; ')
        note.write_text(f'Unsigned preview built from source revision `{snapshot["commit"]}`.\n\n'
                        'Final archives exclude debug maps and separate debug companions. '
                        f'{validation}Cross-compilation does not '
                        'establish native behavior on other hosts.\n\n'
                        f'<!-- app-release-provenance {json.dumps(record, sort_keys=True)} -->\n')
        # Record intent BEFORE the irreversible release create: a lost API response
        # is reconciled by tag and exact provenance on the next invocation.
        journal['create_intent'] = True
        write_json(journal_path, journal)
        request = output / 'release-create.json'
        write_json(request, {'tag_name': tag, 'target_commitish': target, 'draft': True,
                            'prerelease': True, 'name': f'{name} {version}', 'body': note.read_text()})
        # The creation response is authoritative; collection reads can lag behind
        # a newly created draft and must not be required before saving its ID.
        release = json.loads(runtime.run(['gh', 'api', '--method', 'POST',
                             f'repos/{repository}/releases', '--input', request]))
        if release.get('tag_name') != tag or type(release.get('id')) is not int or release['id'] <= 0:
            raise ValueError('Release creation returned an invalid identity; reconcile the saved intent')
        journal['release_id'] = release['id']
        write_json(journal_path, journal)
    for asset in data['release']['assets']:
        verify_file(output / asset['file'], asset)
    runtime.run(['gh', 'release', 'upload', tag, '--repo', repository,
                 *[output / a['file'] for a in data['release']['assets']]])
    journal['uploaded'] = True
    write_json(journal_path, journal)
    finish(runtime, data, output, site, journal_path, journal, batch=batch)


def recover(runtime, site, journal_path, journal, output, rebuild=None, batch=None, restore_installer=None):
    runtime.stage = f'{journal["app"]}:recover'
    repository, tag = runtime.site_repository, journal['tag']
    release = release_by_tag(runtime, tag, journal.get('release_id'))
    record = provenance(release['body'])
    if record['commit'] != journal['snapshot']['commit'] or record.get('dependencies', {}) != journal['snapshot']['dependencies']:
        raise ValueError('Release tag ownership/provenance differs from the interrupted journal')
    journal['release_id'] = release['id']
    write_json(journal_path, journal)
    data = journal['manifest']
    expected = {asset['file'] for asset in data['release']['assets']}
    existing = {asset['name'] for asset in release['assets']}
    if existing - expected:
        raise ValueError('Interrupted draft has unexpected assets; inspect it before resuming')
    if expected - existing:
        if data['appId'] == 'zai-codex':
            raise RuntimeError('Interrupted codex release lacks required assets; inspect the draft before resuming')
        if not release['draft'] or not rebuild:
            raise RuntimeError('Interrupted release lacks required assets; repair the draft without overwriting published bytes')
        rebuild()
        for asset in data['release']['assets']:
            verify_file(output / asset['file'], asset)
        for asset in data['release']['assets']:
            if asset['file'] in existing:
                check = output / 'existing-assets'
                check.mkdir(exist_ok=True)
                runtime.run(['gh', 'release', 'download', tag, '--repo', repository, '--dir', check,
                             '--pattern', asset['file']])
                verify_file(check / asset['file'], asset)
            else:
                runtime.run(['gh', 'release', 'upload', tag, '--repo', repository, output / asset['file']])
        finish(runtime, data, output, site, journal_path, journal, batch=batch)
        return
    output.mkdir(parents=True)
    # Never overwrite partial draft assets with different freshly rebuilt bytes.
    runtime.run(['gh', 'release', 'download', tag, '--repo', repository, '--dir', output,
                 *[arg for a in data['release']['assets'] for arg in ('--pattern', a['file'])]])
    for asset in data['release']['assets']:
        verify_file(output / asset['file'], asset)
    if data['appId'] == 'zai-codex':
        if not restore_installer:
            raise RuntimeError('Interrupted codex release requires installer restoration')
        restore_installer()
    finish(runtime, data, output, site, journal_path, journal, batch=batch)


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


def update_codex_catalog(site, data):
    """Describe only the verified targets in the manifest being published."""
    path = site / 'apps/catalog.json'
    catalog = json.loads(path.read_text())
    apps = catalog if isinstance(catalog, list) else catalog['apps']
    app = next(app for app in apps if app['id'] == 'zai-codex')
    assets = data['release']['assets']
    channel = data['release']['channel']
    names = {'linux': 'Linux', 'macos': 'macOS', 'windows': 'Windows'}
    targets = []
    for platform in app['platforms']:
        available = [asset for asset in assets if asset['platform'] == platform['id']]
        if available:
            architectures = ', '.join(sorted({asset['architecture'] for asset in available}))
            targets.append(f'{names[platform["id"]]} {architectures}')
            packages = ', '.join(f'{asset["architecture"]} ({asset["signing"]})'
                                 for asset in available)
            platform['status'] = (f'Available {channel} packages: {packages}. '
                                  'See the download page for package requirements.')
        else:
            platform['status'] = 'No package is published for this release.'
    app['stage'] = f'{", ".join(targets)} {channel}'
    app['installation'][0] = (f'Available {channel} packages: {", ".join(targets)}. '
                              'Other platform and architecture combinations are not published for this release.')
    path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')


def finish(runtime, data, output, site, journal_path, journal, batch=None):
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
    release = release_by_tag(runtime, tag, journal.get('release_id'))
    if release['draft']:
        runtime.run(['gh', 'release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease'])
    runtime.stage = f'{name}:public-downloads'
    downloaded = output / 'public-downloads'
    downloaded.mkdir(exist_ok=True)
    for asset in data['release']['assets']:
        download(asset, downloaded)
    entry = {'data': data, 'journal_path': journal_path, 'journal': journal}
    if name == 'zai-codex':
        from release_notices import notices_text
        entry['notices'] = notices_text(data, output, journal['snapshot']['commit'])
    if batch is not None:
        batch.append(entry)
    else:
        from release_website import publish_website
        publish_website(runtime, site, [entry])


def verify_pages(runtime, site, name, data):
    from release_packages import HTTPSOnly
    import urllib.request
    runtime.stage = f'{name}:pages'
    deadline = time.monotonic() + 1200
    website_commit = runtime.run(['git', 'rev-parse', 'HEAD'], cwd=site)
    # Verify the actual deployed manifest; a green older deployment is insufficient.
    while time.monotonic() < deadline:
        try:
            url = f'https://phoenixzqy.github.io/releases/{name}/latest/manifest.json'
            request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
            with urllib.request.build_opener(HTTPSOnly()).open(request, timeout=30) as response:
                public = json.load(response)
            if public == data:
                runs = runtime.api(f'repos/{runtime.site_repository}/actions/runs?head_sha={website_commit}&per_page=100')['workflow_runs']
                deployments = [run for run in runs if run.get('path', '').endswith('pages-build-deployment')]
                if any(run['status'] == 'completed' and run['conclusion'] != 'success' for run in deployments):
                    raise RuntimeError('Pages deployment failed for the published website commit')
                if any(run['conclusion'] == 'success' for run in deployments):
                    return
        except (OSError, ValueError):
            pass
        time.sleep(10)
    raise RuntimeError('Website publication did not become publicly available within 20 minutes')

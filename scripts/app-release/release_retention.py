"""Keep the deployed zai release; remove older releases only after verification."""
import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import quote
import urllib.request
import uuid

from release_packages import asset_name, download, HTTPSOnly
from release_publish import version_key
from release_runtime import Runtime, exclusive_lock
from release_sources import remote_snapshot

APPS = ('zai-cli', 'zai-editor', 'zai-gitter', 'zai-codex')


def remote_manifest(runtime, app):
    endpoint = (f'repos/{runtime.site_repository}/contents/releases/{app}/latest/manifest.json'
                f'?ref={quote(runtime.site_branch, safe="")}')
    return json.loads(base64.b64decode(runtime.api(endpoint)['content']))


def release_repository(runtime, data):
    app = data['appId']
    if app not in APPS or not data.get('release') or not data['release']['assets']:
        raise ValueError('Retention requires a published, approved zai app')
    owner, site = runtime.site_repository.split('/')
    if site != 'phoenixzqy.github.io' or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*', owner):
        raise ValueError('Unexpected release website identity')
    tag = f'{app}-v{data["release"]["version"]}'
    version_key(data['release']['version'])
    repositories = {runtime.site_repository}
    if app == 'zai-codex':
        repositories.add(f'{owner}/{app}')
    matching = [repository for repository in repositories if all(
        asset['url'] == f'https://github.com/{repository}/releases/download/{tag}/{asset_name(asset)}'
        for asset in data['release']['assets'])]
    if len(matching) != 1:
        raise ValueError('Manifest assets must name one approved release repository and current tag')
    return matching[0]


def prune_releases(runtime, data, *, apply=True):
    """The caller must verify deployed metadata and public package bytes first."""
    repository = release_repository(runtime, data)
    app, version = data['appId'], data['release']['version']
    tag = f'{app}-v{version}'
    runtime.stage = f'{app}:retention'
    if remote_manifest(runtime, app) != data:
        raise RuntimeError('Remote latest manifest changed; stop retention and retry')
    current = runtime.api(f'repos/{repository}/releases/tags/{tag}')
    if current['draft'] or current['tag_name'] != tag:
        raise ValueError('Current release must exist and be published before retention')
    published = {asset['name']: asset for asset in current['assets']}
    for asset in data['release']['assets']:
        actual = published.get(asset['file'], {})
        if actual.get('size') != asset['bytes'] or actual.get('browser_download_url') != asset['url']:
            raise ValueError('Current release asset identity/size differs from the manifest')
    owner = runtime.site_repository.split('/')[0]
    repositories = (runtime.site_repository, f'{owner}/{app}')
    candidates, tags = [], []
    for target in repositories:
        runs = runtime.api(f'repos/{target}/actions/runs?per_page=100')['workflow_runs']
        if any(run['status'] != 'completed' for run in runs):
            raise RuntimeError(f'{target} has an active workflow; retry retention after it finishes')
        releases = runtime.pages(f'repos/{target}/releases?per_page=100')
        drafts = {release['tag_name'] for release in releases if release['draft']}
        for release in releases:
            match = re.fullmatch(re.escape(app) + r'-v(\d+\.\d+\.\d+(?:\+\d+)?)', release['tag_name'])
            if not match and target != runtime.site_repository:
                match = re.fullmatch(r'v(\d+\.\d+\.\d+(?:\+\d+)?)', release['tag_name'])
            if not release['draft'] and match and version_key(match[1]) < version_key(version):
                candidates.append({'repository': target, 'id': release['id'],
                                   'tag': release['tag_name'],
                                   'bytes': sum(asset['size'] for asset in release['assets'])})
        for reference in runtime.pages(f'repos/{target}/tags?per_page=100'):
            match = re.fullmatch(re.escape(app) + r'-v(\d+\.\d+\.\d+(?:\+\d+)?)', reference['name'])
            if match and reference['name'] not in drafts and version_key(match[1]) < version_key(version):
                tags.append({'repository': target, 'tag': reference['name']})
    # Finish every listing before any mutation, so an API error cannot produce
    # a partially discovered deletion set. Recheck identity before each delete.
    for candidate in candidates:
        runtime.event(f'{"Removing" if apply else "Would remove"} {candidate["repository"]} {candidate["tag"]}')
        if apply:
            if remote_manifest(runtime, app) != data:
                raise RuntimeError('Remote latest manifest changed during retention; stopped')
            observed = runtime.api(f'repos/{candidate["repository"]}/releases/{candidate["id"]}')
            if observed['draft'] or observed['tag_name'] != candidate['tag']:
                raise RuntimeError('Release identity changed during retention; stopped')
            runtime.run(['gh', 'release', 'delete', candidate['tag'], '--repo', candidate['repository'], '--yes'])
    if apply:
        # Discover orphan build tags independently so a retry can finish if the
        # release was deleted before interruption. Bare Go module tags stay put.
        for target in repositories:
            remaining = {release['tag_name'] for release in runtime.pages(f'repos/{target}/releases?per_page=100')}
            for reference in tags:
                if reference['repository'] != target or reference['tag'] in remaining:
                    continue
                if remote_manifest(runtime, app) != data:
                    raise RuntimeError('Remote latest manifest changed during tag retention; stopped')
                runtime.event(f'Removing build tag {target} {reference["tag"]}')
                runtime.run(['gh', 'api', '--method', 'DELETE',
                             f'repos/{target}/git/refs/tags/{quote(reference["tag"], safe="")}'])
    else:
        for reference in tags:
            runtime.event(f'Would remove build tag {reference["repository"]} {reference["tag"]}')
    return candidates


def main(argv=None):
    from release_artifact_retention import prune_native_artifacts, prune_pages_artifacts
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apps', nargs='+', choices=APPS, default=list(APPS))
    parser.add_argument('--owner', default='phoenixzqy')
    parser.add_argument('--apply', action='store_true',
                        help='Delete obsolete releases/tags, consumed native artifacts and older Pages copies.')
    parser.add_argument('--state-dir', type=Path, default=Path.home() / '.local/state/app-release')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*', args.owner):
        parser.error('Invalid owner')
    state = args.state_dir.expanduser().resolve()
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-retention-' + uuid.uuid4().hex[:8]
    runtime = Runtime(state / 'runs' / run_id)
    runtime.site_repository = f'{args.owner}/phoenixzqy.github.io'
    with exclusive_lock(state / 'release.lock'):
        site_snapshot = remote_snapshot(runtime, runtime.site_repository)
        runtime.site_branch = site_snapshot['branch']
        for app in dict.fromkeys(args.apps):
            data = remote_manifest(runtime, app)
            if data['appId'] != app:
                raise ValueError('Manifest app identity mismatch')
            release_repository(runtime, data)
            request = urllib.request.Request(
                f'https://{args.owner}.github.io/releases/{app}/latest/manifest.json',
                headers={'Cache-Control': 'no-cache'})
            with urllib.request.build_opener(HTTPSOnly()).open(request, timeout=30) as response:
                if json.load(response) != data:
                    raise RuntimeError('Deployed manifest differs from the remote default branch')
            if args.apply:
                with tempfile.TemporaryDirectory(prefix=f'{app}-retention-') as temporary:
                    for asset in data['release']['assets']:
                        runtime.event(f'Verifying current public package {asset["file"]}')
                        download(asset, Path(temporary))
            candidates = prune_releases(runtime, data, apply=args.apply)
            runtime.event(f'{len(candidates)} older releases {"removed" if args.apply else "eligible"}; '
                          f'{sum(item["bytes"] for item in candidates)} package bytes')
            journal_path = state / f'{app}.json'
            if app == 'zai-cli' and journal_path.exists():
                journal = json.loads(journal_path.read_text())
                if journal.get('dispatch_intent') and journal.get('manifest') == data:
                    prune_native_artifacts(runtime, data, journal, apply=args.apply)
        prune_pages_artifacts(runtime, site_snapshot['commit'], apply=args.apply)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

"""Resolve remote identities/default branches and create disposable source clones."""
from __future__ import annotations

import json
from pathlib import Path
import re
import shutil

APPS = ('zai-editor', 'zai-gitter', 'zai-cli', 'zai-codex', 'BPlayer')
EXCLUDED = {'zai-claude', 'zai-claude-code', 'zai-design-system'}
SHA = re.compile(r'^[0-9a-f]{40}$')


def identity(url):
    match = re.fullmatch(r'(?:https://github.com/|git@github.com:|ssh://git@github.com/)([^/]+/[^/]+?)(?:\.git)?/?', url)
    if not match:
        raise ValueError('Expected a GitHub origin URL without credentials')
    return match[1]


def remote_snapshot(runtime, repository):
    metadata = runtime.api(f'repos/{repository}')
    branch = metadata['default_branch']
    # Branch names can contain slash; the Git API accepts an encoded ref.
    from urllib.parse import quote
    revision = runtime.api(f'repos/{repository}/git/ref/heads/{quote(branch, safe="")}')['object']['sha']
    if not SHA.fullmatch(revision):
        raise ValueError(f'Invalid remote revision for {repository}')
    return {'repository': repository, 'branch': branch, 'commit': revision}


def discover(runtime, owner, selected=None):
    repositories = runtime.pages('user/repos?per_page=100&affiliation=owner')
    repositories = [item for item in repositories if item['owner']['login'].lower() == owner.lower()]
    names = {item['name'] for item in repositories}
    candidates = {name for name in names if (name.startswith('zai-') or name == 'BPlayer') and name not in EXCLUDED}
    unknown = candidates - set(APPS)
    if unknown and not selected:
        raise ValueError(f'New release adapters required for: {sorted(unknown)}')
    requested = set(selected or candidates)
    if requested - candidates:
        raise ValueError(f'Unavailable or excluded repositories: {sorted(requested - candidates)}')
    return [remote_snapshot(runtime, f'{owner}/{name}') for name in APPS if name in requested]


def clone(runtime, snapshot, workspace, root, *, recovery=False):
    repository = snapshot['repository']
    name = repository.split('/')[1]
    destination = root / name
    local = workspace / name
    if destination.exists() or destination.is_symlink():
        raise FileExistsError(f'Clone destination already exists: {destination}')
    args = ['git', 'clone', '--no-checkout', f'https://github.com/{repository}.git', destination]
    if local.exists():
        origin = runtime.run(['git', '-C', local, 'remote', 'get-url', 'origin'])
        if identity(origin).lower() != repository.lower():
            raise ValueError(f'Local checkout identity mismatch: {local}')
        # A shared checkout's objects can change during maintenance. This cache
        # is only an optimization; retry independently if cloning with it fails.
        try:
            runtime.run(args[:3] + ['--reference-if-able', local, '--dissociate'] + args[3:])
        except RuntimeError:
            runtime.event('Local-reference clone failed; retrying from the remote without the object cache')
            if destination.is_symlink():
                raise ValueError(f'Unexpected linked clone destination: {destination}')
            if destination.exists():
                shutil.rmtree(destination)
            runtime.run(args)
    else:
        runtime.run(args)
    runtime.run(['git', 'fetch', 'origin', f'+refs/heads/{snapshot["branch"]}:refs/remotes/origin/{snapshot["branch"]}'], cwd=destination)
    tip = runtime.run(['git', 'rev-parse', f'origin/{snapshot["branch"]}'], cwd=destination)
    if recovery:
        # Interrupted publication must restore its immutable source, even after
        # the customization branch advances. Reject revisions outside that branch.
        runtime.run(['git', 'merge-base', '--is-ancestor', snapshot['commit'], tip], cwd=destination)
    elif tip != snapshot['commit']:
        raise RuntimeError(f'{repository} changed during discovery; retry with a fresh snapshot')
    runtime.run(['git', 'checkout', '--detach', snapshot['commit']], cwd=destination)
    return destination


def provenance(body):
    match = re.search(r'<!-- app-release-provenance\s+(.*?)\s+-->', body or '', re.S)
    if match:
        value = json.loads(match[1])
        if not SHA.fullmatch(value['commit']):
            raise ValueError('Invalid structured release provenance')
        return value
    # Bootstrap previous human-written releases, but never use the docs mirror.
    commits = re.findall(r'`([0-9a-f]{40})`', body or '')
    if not commits:
        raise ValueError('Published release lacks a source revision; establish its provenance first')
    return {'commit': commits[0], 'dependencies': {}}


def changed(snapshot, previous):
    return (snapshot['commit'] != previous['commit'] or
            snapshot.get('dependencies', {}) != previous.get('dependencies', {}))

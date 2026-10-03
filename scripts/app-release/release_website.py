"""Serialize a batch of approved manifests through one website hook and deployment."""
import json

from release_runtime import write_json


def publish_website(runtime, site, entries):
    from release_publish import reconcile_latest, update_codex_catalog, verify_pages
    runtime.stage = 'website:batch'
    runtime.run(['git', 'fetch', 'origin', runtime.site_branch], cwd=site)
    runtime.run(['git', 'merge', '--ff-only', f'origin/{runtime.site_branch}'], cwd=site)
    active = []
    for entry in entries:
        data, journal = entry['data'], entry['journal']
        name = data['appId']
        path = site / f'releases/{name}/latest/manifest.json'
        disposition = reconcile_latest(json.loads(path.read_text()), data)
        if disposition == 'superseded':
            journal.update(complete=True, superseded=True)
            write_json(entry['journal_path'], journal)
            continue
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        if name == 'zai-codex':
            update_codex_catalog(site, data)
        runtime.run(['git', 'add', str(path)], cwd=site)
        if name == 'zai-codex':
            runtime.run(['git', 'add', 'apps/catalog.json', 'install/templates/zai-codex.py.in',
                         'install/zai-codex-source.json', 'install/zai-codex.sh', 'install/zai-codex.ps1'], cwd=site)
        active.append(entry)
    if not active:
        return
    runtime.run(['npm', 'run', 'validate:apps'], cwd=site)
    if runtime.run(['git', 'diff', '--cached', '--name-only'], cwd=site):
        versions = ', '.join(f'{entry["data"]["appId"]} {entry["data"]["release"]["version"]}' for entry in active)
        runtime.run(['git', 'commit', '-m', f'Publish {versions}'], cwd=site)
    for attempt in range(3):
        runtime.run(['git', 'fetch', 'origin', runtime.site_branch], cwd=site)
        runtime.run(['git', 'rebase', f'origin/{runtime.site_branch}'], cwd=site)
        runtime.run(['npm', 'run', 'validate:apps'], cwd=site)
        try:
            # One complete pre-push gate validates the combined outgoing head.
            runtime.run(['git', 'push', 'origin', f'HEAD:refs/heads/{runtime.site_branch}'], cwd=site)
            break
        except RuntimeError:
            if attempt == 2:
                raise
    commit = runtime.run(['git', 'rev-parse', 'HEAD'], cwd=site)
    for entry in active:
        entry['journal']['website_commit'] = commit
        write_json(entry['journal_path'], entry['journal'])
    for entry in active:
        data = entry['data']
        verify_pages(runtime, site, data['appId'], data)
        entry['journal']['complete'] = True
        write_json(entry['journal_path'], entry['journal'])

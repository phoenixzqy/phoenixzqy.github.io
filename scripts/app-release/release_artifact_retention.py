"""Remove consumed native artifacts and superseded Pages deployment copies."""
import json


def collection(runtime, endpoint, key):
    pages = json.loads(runtime.run(['gh', 'api', '--paginate', '--slurp', endpoint], timeout=120))
    return [item for page in pages for item in page[key]]


def delete_artifacts(runtime, repository, candidates, verify, *, apply):
    for artifact in candidates:
        runtime.event(f'{"Removing" if apply else "Would remove"} Actions artifact '
                      f'{repository} {artifact["id"]} ({artifact["size_in_bytes"]} bytes)')
        if apply:
            verify(artifact)
            endpoint = f'repos/{repository}/actions/artifacts/{artifact["id"]}'
            observed = runtime.api(endpoint)
            if (observed['id'], observed['name'], observed['workflow_run']) != (
                    artifact['id'], artifact['name'], artifact['workflow_run']):
                raise RuntimeError('Actions artifact identity changed; stopped retention')
            runtime.run(['gh', 'api', '--method', 'DELETE', endpoint])
    return candidates


def prune_native_artifacts(runtime, data, journal, *, apply=True):
    """Call only after verifying public packages and their deployed manifest."""
    from release_retention import remote_manifest
    snapshot = journal['snapshot']
    repository = snapshot['repository']
    owner = runtime.site_repository.split('/')[0]
    if (data['appId'] != 'zai-cli' or journal['app'] != 'zai-cli'
            or journal['manifest'] != data or not journal.get('website_commit')
            or not journal.get('dispatch_intent') or repository != f'{owner}/zai-cli'
            or snapshot['branch'] != 'main'
            or journal['tag'] != f'zai-cli-v{data["release"]["version"]}'):
        raise ValueError('Native artifact retention requires the verified publication journal')
    endpoint = f'repos/{repository}/actions/runs/{journal["run_id"]}'

    def verify(_artifact=None):
        if remote_manifest(runtime, 'zai-cli') != data:
            raise RuntimeError('Remote latest manifest changed; stopped native artifact retention')
        run = runtime.api(endpoint)
        if (run['id'] != journal['run_id'] or run['head_sha'] != snapshot['commit']
                or run['head_branch'] != snapshot['branch'] or run['status'] != 'completed'
                or run['conclusion'] != 'success' or run['event'] != 'workflow_dispatch'
                or run['path'] != '.github/workflows/release.yml'
                or run['display_title'] != f'zai-cli release {journal["request_id"]}'
                or run['run_attempt'] != journal['workflow_terminal']['run_attempt']):
            raise RuntimeError('Native workflow identity/attempt changed or is unfinished; stopped retention')

    verify()
    artifacts = collection(runtime, f'{endpoint}/artifacts?per_page=100', 'artifacts')
    names = {'release-inputs', 'native-release', 'source-validation'} | {
        f'package-{system}-{architecture}'
        for system in ('linux', 'darwin', 'windows') for architecture in ('amd64', 'arm64')}
    candidates = [artifact for artifact in artifacts
                  if artifact['name'] in names and artifact['workflow_run']['id'] == journal['run_id']]
    runtime.stage = 'zai-cli:artifact-retention'
    return delete_artifacts(runtime, repository, candidates, verify, apply=apply)


def prune_pages_artifacts(runtime, commit, *, apply=True):
    """Keep the successfully deployed main build, never active or newer runs."""
    repository = runtime.site_repository
    runtime.stage = 'website:artifact-retention'

    def verify():
        build = runtime.api(f'repos/{repository}/pages/builds/latest')
        if build['status'] != 'built' or build['commit'] != commit:
            raise RuntimeError('Latest Pages build changed or is unfinished; stopped artifact retention')

    verify()
    runs = collection(runtime, f'repos/{repository}/actions/runs?head_sha={commit}&per_page=100',
                      'workflow_runs')
    deployments = [run for run in runs if run['path'] == 'dynamic/pages/pages-build-deployment'
                   and run['head_branch'] == runtime.site_branch and run['head_sha'] == commit
                   and run['status'] == 'completed' and run['conclusion'] == 'success']
    if not deployments:
        raise RuntimeError('No successful Pages workflow for the verified deployment')
    latest = max(deployments, key=lambda run: run['id'])
    artifacts = collection(runtime, f'repos/{repository}/actions/artifacts?per_page=100', 'artifacts')
    kept = [artifact for artifact in artifacts if artifact['name'] == 'github-pages'
            and artifact['workflow_run']['id'] == latest['id']]
    if not kept and any(artifact['name'] == 'github-pages' for artifact in artifacts):
        raise RuntimeError('Latest Pages artifact missing; stop before removing older copies')
    candidates = []
    for artifact in artifacts:
        source = artifact['workflow_run']
        if (artifact['name'] != 'github-pages' or source['head_branch'] != runtime.site_branch
                or source['id'] >= latest['id']
                or not kept or artifact['created_at'] >= min(item['created_at'] for item in kept)):
            continue
        run = runtime.api(f'repos/{repository}/actions/runs/{source["id"]}')
        if (run['path'] == 'dynamic/pages/pages-build-deployment' and run['status'] == 'completed'
                and run['head_branch'] == source['head_branch'] and run['head_sha'] == source['head_sha']):
            candidates.append(artifact)

    def verify_candidate(artifact):
        verify()
        current = runtime.api(f'repos/{repository}/actions/artifacts/{kept[0]["id"]}')
        if current['name'] != 'github-pages' or current['workflow_run']['id'] != latest['id']:
            raise RuntimeError('Latest Pages artifact changed; stopped retention')
        source = artifact['workflow_run']
        run = runtime.api(f'repos/{repository}/actions/runs/{source["id"]}')
        if (run['status'] != 'completed' or run['path'] != 'dynamic/pages/pages-build-deployment'
                or run['head_branch'] != source['head_branch'] or run['head_sha'] != source['head_sha']):
            raise RuntimeError('Older Pages workflow changed or is active; stopped artifact retention')

    return delete_artifacts(runtime, repository, candidates, verify_candidate, apply=apply)

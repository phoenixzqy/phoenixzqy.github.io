"""Consume the exact six-target native GUI artifact from zai-cli's private workflow."""
import hashlib
import json
import zipfile

from release_jobs import history
from release_packages import verify_file
from release_publish import publish
from release_runtime import write_json
from release_sources import clone
from release_workflow import workflow_run

TARGETS = {
    ('linux', 'amd64'): ('linux', 'x64', 'x86_64-unknown-linux-gnu'),
    ('linux', 'arm64'): ('linux', 'arm64', 'aarch64-unknown-linux-gnu'),
    ('darwin', 'amd64'): ('macos', 'x64', 'x86_64-apple-darwin'),
    ('darwin', 'arm64'): ('macos', 'arm64', 'aarch64-apple-darwin'),
    ('windows', 'amd64'): ('windows', 'x64', 'x86_64-pc-windows-msvc'),
    ('windows', 'arm64'): ('windows', 'arm64', 'aarch64-pc-windows-msvc'),
}


def verify_artifacts(data, output, snapshot, journal):
    version = journal['version']
    record = {key: snapshot[key] for key in ('repository', 'branch', 'commit', 'dependencies')}
    record.update(version=version, request_id=journal['request_id'])
    if json.loads((output / 'provenance.json').read_text()) != record:
        raise ValueError('Native workflow artifact provenance mismatch')
    if (data.get('schemaVersion') != 1 or data.get('appId') != 'zai-cli'
            or data['release']['version'] != version):
        raise ValueError('Native workflow manifest identity mismatch')
    expected = {f'zai-cli-{version}-{goos}-{arch}.zip': (goos, arch) for goos, arch in TARGETS}
    assets = data['release']['assets']
    if len(assets) != 6 or {asset['file'] for asset in assets} != set(expected):
        raise ValueError('Native release requires all six OS/architecture GUI packages')
    for asset in assets:
        target = expected[asset['file']]
        platform, architecture, rust_target = TARGETS[target]
        url = f'https://github.com/{snapshot["site_repository"]}/releases/download/zai-cli-v{version}/{asset["file"]}'
        if ((asset['platform'], asset['architecture']) != (platform, architecture)
                or asset.get('url') != url or asset['signing'] != 'unsigned'):
            raise ValueError('Native workflow asset identity mismatch')
        path = output / asset['file']
        verify_file(path, asset)
        with zipfile.ZipFile(path) as archive:
            if json.loads(archive.read('zai-release.json')) != dict(record, target=list(target)):
                raise ValueError('Native package source/dependency provenance mismatch')
            suffix = '.exe' if platform == 'windows' else ''
            required = {'install.py', *[name + suffix for name in ('zai', 'zai-editor', 'zai-gitter')]}
            if not required <= set(archive.namelist()):
                raise ValueError('Native package is missing public commands or installer')
            desktop = json.loads(archive.read('desktop/desktop-manifest.json'))
            prefix = 'zai.app/Contents/MacOS/' if platform == 'macos' else ''
            applications = {prefix + name + suffix for name in ('zai-desktop', 'zai-desktop-runtime')}
            files = desktop['files']
            actual = {name.removeprefix('desktop/') for name in archive.namelist()
                      if name.startswith('desktop/') and not name.endswith('/')}
            if (desktop['protocol'] != 1 or desktop['target'] != rust_target
                    or desktop['cli_sha256'] != hashlib.sha256(archive.read('zai' + suffix)).hexdigest()
                    or not applications <= files.keys()
                    or set(files) != actual - {'desktop-manifest.json'}):
                raise ValueError('Native desktop payload/target/CLI binding mismatch')
            for name, digest in files.items():
                if hashlib.sha256(archive.read('desktop/' + name)).hexdigest() != digest:
                    raise ValueError(f'Native desktop checksum mismatch: {name}')
    return data


def prepare_cli(runtime, args, task, root, site):
    snapshot, journal = task['snapshot'], task['journal']
    if snapshot['repository'] != 'phoenixzqy/zai-cli' or snapshot['branch'] != 'main':
        raise ValueError('Native CLI releases require the authoritative source main branch')
    runtime.stage = 'zai-cli:workflow'
    source = None if journal.get('dispatch_intent') else clone(runtime, snapshot, args.workspace, root)
    workflow_run(runtime, snapshot, task['journal_path'], journal, source,
                 app='zai-cli', workflow='release.yml',
                 inputs={'dependencies': json.dumps(snapshot['dependencies'], sort_keys=True)})
    output = task['output']
    output.mkdir(parents=True, exist_ok=True)
    runtime.run(['gh', 'run', 'download', str(journal['run_id']), '--repo', snapshot['repository'],
                 '--name', 'native-release', '--dir', output])
    data = verify_artifacts(json.loads((output / 'manifest.json').read_text()), output, snapshot, journal)
    if journal.get('manifest') and journal['manifest'] != data:
        raise ValueError('Recovered native workflow artifacts differ from the saved immutable manifest')
    journal['manifest'] = data
    write_json(task['journal_path'], journal)
    return data


def run_cli(runtime, args, task, root, site):
    data = prepare_cli(runtime, args, task, root, site)
    if task['journal']['tag'] in history(runtime, runtime.site_repository):
        raise RuntimeError('Version/tag allocated concurrently; inspect before publication')
    publish(runtime, task['snapshot'], data, task['output'], site, task['journal_path'], task['journal'])

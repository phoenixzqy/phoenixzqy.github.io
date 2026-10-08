"""Adapters call each source repository's existing release tooling."""
from __future__ import annotations

import json
import os
from pathlib import Path
import platform
import sys

from release_packages import digest, inspect_archive
from release_runtime import timestamp


def allocate(runtime, source, name, history):
    script = source / '.github/scripts/release_version.py'
    if name == 'zai-codex':
        versions = [tuple(map(int, tag.split('-v')[1].split('.'))) for tag in history
                    if tag.startswith('zai-codex-v')]
        major, minor, patch = max(versions, default=(0, 1, -1))
        return f'{major}.{minor}.{patch + 1}'
    # Call the established pure allocator, independent of workflow_dispatch's
    # legacy main-only wrapper. Our remote snapshot enforces branch selection.
    code = '''import importlib.util,json,pathlib,subprocess,sys
spec=importlib.util.spec_from_file_location("allocator",sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
name=sys.argv[2];tags=json.loads(sys.argv[3])
if name=="zai-cli":
 count=int(subprocess.check_output(["git","rev-list","--count","HEAD"],text=True))
 result=m.allocate(m.baseline_version(pathlib.Path("src/zai/cli/about/version.go"),count),tags)
elif name=="zai-editor": result=m.allocate(m.MINIMUM_VERSION,tags,name+"-v")
else: result=m.allocate(m.MINIMUM_VERSION,tags)
print(result)
'''
    return runtime.run([sys.executable, '-B', '-c', code, script, name, json.dumps(history)], cwd=source).splitlines()[-1]


def native_target():
    system = platform.system()
    machine = platform.machine().lower()
    architecture = 'aarch64' if machine in ('arm64', 'aarch64') else 'x86_64' if machine in ('amd64', 'x86_64') else None
    suffix = {'Linux': 'unknown-linux-gnu', 'Darwin': 'apple-darwin', 'Windows': 'pc-windows-msvc'}.get(system)
    if not architecture or not suffix:
        raise ValueError('Unsupported native zai-codex release host')
    return f'{architecture}-{suffix}'


def validation_python(runtime, source, name):
    if name != 'zai-cli':
        return sys.executable
    environment = source / '.venv-local-ci'
    runtime.run([sys.executable, '-B', '-m', 'venv', environment], cwd=source)
    interpreter = environment / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    runtime.run([interpreter, '-B', '-m', 'pip', 'install', '-r',
                 '.github/skills/performance-measurement/requirements.txt'], cwd=source)
    return interpreter


def prepare_codex_validation(runtime, source):
    # The gate builds SDK executables at codex-rs/target even when Cargo uses an
    # operator-selected shared cache. Keep those paths pointing at the same bytes.
    target = runtime.environment.get('CARGO_TARGET_DIR', os.environ.get('CARGO_TARGET_DIR'))
    if target:
        target = Path(target).expanduser()
        if not target.is_absolute():
            raise ValueError('zai-codex release CARGO_TARGET_DIR must be absolute')
        target.mkdir(parents=True, exist_ok=True)
        (source / 'codex-rs/target').symlink_to(target, target_is_directory=True)
    # Use the source's trusted V8 checksum pins for validation as well as packaging.
    code = '''import json,sys
sys.path.insert(0, "scripts")
from codex_package.targets import TARGET_SPECS
from codex_package.v8 import resolve_codex_v8_cargo_env
print(json.dumps(resolve_codex_v8_cargo_env(TARGET_SPECS[sys.argv[1]])))
'''
    runtime.environment.update(json.loads(runtime.run(
        [sys.executable, '-B', '-c', code, native_target()], cwd=source)))
    runtime.run(['pnpm', 'install', '--frozen-lockfile'], cwd=source)


def build(runtime, source, snapshot, version, output, site, notices):
    name = snapshot['repository'].split('/')[1]
    output.mkdir(parents=True)
    manifest = output / 'manifest.json'
    if name == 'zai-codex' and (not notices or not notices.is_dir()):
        raise ValueError('zai-codex requires --codex-notices with reviewed dependency notices')
    runtime.stage = f'{name}:validation'
    # These gates are the repositories' required local validation; no hosted CI.
    interpreter = validation_python(runtime, source, name)
    if name == 'zai-codex':
        prepare_codex_validation(runtime, source)
    runtime.run([interpreter, '-B', '.github/scripts/local_ci.py'], cwd=source)
    runtime.stage = f'{name}:build'
    if name == 'zai-codex':
        if not notices or not notices.is_dir():
            raise ValueError('zai-codex requires --codex-notices with reviewed dependency notices')
        target = native_target()
        runtime.run([sys.executable, '-B', 'scripts/prepare_zai_codex_release.py', '--version', version,
                     '--third-party-notices', notices, '--output', output], cwd=source)
        archive = output / f'zai-codex-{version}-{target}.zip'
        inspect_archive(archive)
        architecture = 'arm64' if target.startswith('aarch64') else 'x64'
        os_id = {'Linux': 'linux', 'Darwin': 'macos', 'Windows': 'windows'}[platform.system()]
        data = {'schemaVersion': 1, 'appId': name, 'release': {
            'version': version, 'channel': 'preview', 'publishedAt': timestamp(),
            'notes': ['Native preview built and checked on the advertised host. Packages are unsigned.'],
            'assets': [{'name': f'zai-codex {os_id} {architecture}', 'platform': os_id,
                        'architecture': architecture, 'file': archive.name, 'bytes': archive.stat().st_size,
                        'sha256': digest(archive), 'signing': 'unsigned',
                        'url': f'https://github.com/{snapshot["site_repository"]}/releases/download/{name}-v{version}/{archive.name}',
                        'installNotes': 'Unsigned native preview. Use the checksum-verifying one-line installer. '
                                        'Linux requires compatible glibc and native libraries; see release notes.'}]}}
        manifest.write_text(json.dumps(data, indent=2) + '\n')
        runtime.run(['node', 'scripts/sync-zai-codex-installer.mjs', source], cwd=site)
        runtime.run(['npm', 'run', 'build:installers'], cwd=site)
    else:
        prefix = 'src/' if name == 'zai-cli' else ''
        args = [sys.executable, '-B', f'{prefix}scripts/release_build.py', '--version', version, '--output', output]
        if name == 'zai-cli':
            args.append('--locked-tools')
        runtime.run(args, cwd=source)
        args = [sys.executable, '-B', f'{prefix}scripts/release_manifest.py', '--version', version,
                '--tag', f'{name}-v{version}', '--dir', output, '--output', manifest]
        if name == 'zai-editor':
            args += ['--catalog', site / 'apps/catalog.json']
        runtime.run(args, cwd=source)
        data = json.loads(manifest.read_text())
    for asset in data['release']['assets']:
        from release_packages import verify_file
        verify_file(output / asset['file'], asset)
    return data


def refresh_dependencies(runtime, source, snapshot):
    name = snapshot['repository'].split('/')[1]
    if name != 'zai-cli':
        return
    runtime.run([sys.executable, '-B', 'src/scripts/utils/tool_modules.py', '--update'], cwd=source)
    for dependency, expected in snapshot['dependencies'].items():
        module = f'github.com/{dependency}'
        selected = json.loads(runtime.run(['go', 'list', '-m', '-json', module], cwd=source / 'src/zai'))
        resolved = json.loads(runtime.run(['go', 'list', '-m', '-json', f'{module}@{selected["Version"]}'], cwd=source / 'src/zai'))
        if resolved.get('Origin', {}).get('Hash') != expected:
            raise ValueError(f'Dependency changed while resolving {module}; retry')

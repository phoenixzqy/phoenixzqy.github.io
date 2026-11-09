#!/usr/bin/env python3
"""Run one scheduled release group using freshly fetched website tooling.

This file is safe to fetch from public main. Host paths, credentials, build
outputs, and release journals stay outside the website repository.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile


GROUPS = ('zai', 'bplayer', 'codex')
SITE_URL = 'https://github.com/phoenixzqy/phoenixzqy.github.io.git'


@contextmanager
def release_lock(path: Path):
    with path.open('a+b') as stream:
        path.chmod(0o600)
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('A release is already running; waiting for it to finish.', flush=True)
            fcntl.flock(stream, fcntl.LOCK_EX)
        yield


def run(command, *, cwd=None, env=None, timeout=None):
    process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL)

    def forward(number, _frame):
        if process.poll() is None:
            process.send_signal(number)

    previous = {number: signal.signal(number, forward) for number in (signal.SIGINT, signal.SIGTERM)}
    try:
        return process.wait(timeout=timeout)
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait()
        for number, handler in previous.items():
            signal.signal(number, handler)


def native_environment(path: Path, env: dict[str, str], temporary: str):
    path = path.expanduser().resolve()
    if not path.is_file():
        raise ValueError(f'Codex native environment file is missing: {path}')
    spec = importlib.util.spec_from_file_location('release_native_env', path)
    if spec is None or spec.loader is None:
        raise ValueError(f'Cannot load Codex native environment file: {path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.native_environment(env, temporary)


def launch(args, entrypoint, apps=(), skip_tests=False):
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', PYTHONDONTWRITEBYTECODE='1')
    for key in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'):
        env.pop(key, None)

    # Native Codex validation needs disk-backed temporary storage on some hosts.
    cache = Path.home() / '.cache'
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ar-', dir=cache) as temporary:
        env.update({key: temporary for key in ('TMPDIR', 'TMP', 'TEMP')})
        if args.group == 'codex':
            env = native_environment(args.native_env_file, env, temporary)

        if args.tooling_dir:
            checkout = args.tooling_dir.expanduser().resolve()
            if not (checkout / 'scripts/app-release' / entrypoint).is_file():
                raise ValueError('Release entry point is missing from --tooling-dir')
        else:
            checkout = Path(temporary) / 'tooling'
            print('Loading release tooling from website main.', flush=True)
            code = run(['git', 'clone', '--branch', 'main', '--depth', '1',
                        '--filter=blob:none', '--sparse', SITE_URL, str(checkout)],
                       env=env, timeout=300)
            if code:
                return code
            code = run(['git', 'sparse-checkout', 'set', 'scripts/app-release'],
                       cwd=checkout, env=env, timeout=120)
            if code:
                return code

        command = [sys.executable, '-u', '-B',
                   str(checkout / 'scripts/app-release' / entrypoint),
                   '--timeout', '21600', '--state-dir', str(args.state_dir)]
        command.append('--dry-run' if args.check else '--publish')
        if skip_tests:
            command.append('--skip-tests')
        if apps:
            command.extend(['--apps', *apps])
        if args.group == 'codex' and args.codex_notices:
            command.extend(['--codex-notices', str(args.codex_notices)])
        print(f'Release group: {args.group}; entry point: {entrypoint}', flush=True)
        return run(command, cwd=checkout, env=env)


def release_zai_apps(args):
    return launch(args, 'release_apps.py',
                  apps=('zai-cli', 'zai-editor', 'zai-gitter'), skip_tests=True)


def release_bplayer(args):
    return launch(args, 'release_apps.py', apps=('BPlayer',), skip_tests=True)


def release_codex(args):
    return launch(args, 'release_codex.py')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group', required=True, choices=GROUPS)
    parser.add_argument('--check', '--dry-run', dest='check', action='store_true',
                        help='Detect updates without building or publishing.')
    parser.add_argument('--tooling-dir', type=Path,
                        help='Use a local tooling checkout for pre-publication checks.')
    parser.add_argument('--state-dir', type=Path,
                        default=Path.home() / '.local/state/app-release')
    parser.add_argument('--native-env-file', type=Path,
                        help='Host-owned native environment module, required for Codex.')
    parser.add_argument('--codex-notices', type=Path,
                        help='Optional legacy Codex notice directory.')
    args = parser.parse_args(argv)
    if args.group == 'codex' and args.native_env_file is None:
        parser.error('--native-env-file is required for Codex')
    if args.group != 'codex' and args.native_env_file is not None:
        parser.error('--native-env-file is only used for Codex')
    args.state_dir = args.state_dir.expanduser().resolve()
    args.state_dir.mkdir(parents=True, exist_ok=True)
    with release_lock(args.state_dir / 'launcher.lock'):
        # Also wait for a run started before launcher serialization was added.
        with release_lock(args.state_dir / 'release.lock'):
            pass
        return {'zai': release_zai_apps, 'bplayer': release_bplayer,
                'codex': release_codex}[args.group](args)


if __name__ == '__main__':
    raise SystemExit(main())

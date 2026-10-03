"""Bounded child processes, private reports, locking and atomic journals."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import signal
import subprocess
import time


def timestamp():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


@contextmanager
def exclusive_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open('a+b') as stream:
        if os.name == 'nt':
            import msvcrt
            stream.seek(0)
            stream.write(b'0')
            stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)


class Runtime:
    def __init__(self, directory, timeout=7200):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=False, mode=0o700)
        self.timeout = timeout
        self.sequence = 0
        self.stage = 'discovery'
        self.environment = {}
        self.secrets = [value for key, value in os.environ.items()
                        if any(word in key.upper() for word in ('TOKEN', 'PASSWORD', 'SECRET')) and value]

    def event(self, message):
        print(f'{timestamp()} [{self.stage}] {message}', flush=True)

    def run(self, args, cwd=None, env=None, timeout=None):
        self.sequence += 1
        path = self.directory / f'{self.sequence:04d}.log'
        safe_args = [str(arg) for arg in args]
        self.event(f'Running {Path(safe_args[0]).name}; command log {path.name}')
        child_env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GOWORK='off', PYTHONDONTWRITEBYTECODE='1')
        child_env.update(self.environment)
        # Hooks and enclosing Git commands must not redirect child repositories.
        for key in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'):
            child_env.pop(key, None)
        if env:
            child_env.update(env)
            self.secrets.extend(value for key, value in env.items() if value and
                                any(word in key.upper() for word in ('TOKEN', 'PASSWORD', 'SECRET')))
        metadata_path = path.with_suffix('.command.json')
        metadata = {'argv': safe_args, 'cwd': str(cwd) if cwd else None, 'stage': self.stage,
                    'started_at': timestamp(), 'timeout_seconds': timeout or self.timeout}
        for secret in self.secrets:
            metadata['argv'] = [arg.replace(secret, '[REDACTED]') for arg in metadata['argv']]
        write_json(metadata_path, metadata)
        process = None
        creation = {'start_new_session': True} if os.name != 'nt' else {
            'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW}
        try:
            with path.open('wb') as log:
                path.chmod(0o600)
                process = subprocess.Popen(safe_args, cwd=cwd, env=child_env,
                                           stdin=subprocess.DEVNULL, stdout=log, stderr=log, **creation)
                try:
                    process.wait(timeout=timeout or self.timeout)
                except BaseException:
                    if os.name == 'nt':
                        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        try:
                            os.killpg(process.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        pass
                    finally:
                        # The leader can exit while a descendant ignores TERM.
                        if os.name != 'nt':
                            try:
                                os.killpg(process.pid, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                        process.wait()
                    raise
        finally:
            metadata['exit_code'] = process.returncode if process else None
            metadata['finished_at'] = timestamp()
            write_json(metadata_path, metadata)
            output = path.read_text(errors='replace') if path.exists() else ''
            for secret in self.secrets:
                output = output.replace(secret, '[REDACTED]')
            if path.exists():
                path.write_text(output)
        if process.returncode:
            raise RuntimeError(f'{self.stage}: {safe_args[0]} exited {process.returncode}; '
                               f'command {metadata_path}; log {path}\n{output[-1500:]}')
        return output.strip()

    def api(self, endpoint):
        return json.loads(self.run(['gh', 'api', endpoint], timeout=120))

    def pages(self, endpoint):
        pages = json.loads(self.run(['gh', 'api', '--paginate', '--slurp', endpoint], timeout=120))
        return [item for page in pages for item in page]

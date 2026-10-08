"""Source-cache failures must not prevent an independent verified clone."""
from concurrent.futures import CancelledError
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from release_runtime import Runtime
from release_sources import clone


class CloneTest(unittest.TestCase):
    def test_missing_cached_object_retries_remote_and_preserves_local_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote = root / 'remote'
            local = root / 'workspace' / 'app'
            output = root / 'output'
            output.mkdir()
            environment = {key: value for key, value in os.environ.items()
                           if not key.startswith('GIT_')}

            def git(*args):
                return subprocess.run(['git', *map(str, args)], env=environment,
                                      check=True, capture_output=True, text=True).stdout.strip()

            git('init', '--initial-branch=custom', remote)
            (remote / 'file').write_text('source bytes')
            git('-C', remote, 'add', 'file')
            git('-C', remote, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
                '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture')
            revision = git('-C', remote, 'rev-parse', 'HEAD')
            blob = git('-C', remote, 'rev-parse', 'HEAD:file')
            git('clone', '--no-hardlinks', remote, local)
            git('-C', local, 'remote', 'set-url', 'origin', 'https://github.com/owner/app.git')
            missing = local / '.git/objects' / blob[:2] / blob[2:]
            missing.unlink()
            (local / 'file').write_text('uncommitted local work')
            snapshot = {'repository': 'owner/app', 'branch': 'custom', 'commit': revision}

            class LocalRemote(Runtime):
                def run(self, args, **kwargs):
                    if args[:2] == ['git', 'clone']:
                        args = [remote.as_uri() if arg == 'https://github.com/owner/app.git' else arg
                                for arg in args]
                    return super().run(args, **kwargs)

            with patch.dict(os.environ, environment, clear=True):
                runtime = LocalRemote(root / 'logs')
                destination = clone(runtime, snapshot, root / 'workspace', output)
            self.assertEqual((destination / 'file').read_text(), 'source bytes')
            self.assertEqual(git('-C', destination, 'rev-parse', 'HEAD'), revision)
            self.assertFalse((destination / '.git/objects/info/alternates').exists())
            self.assertEqual((local / 'file').read_text(), 'uncommitted local work')
            self.assertFalse(missing.exists())
            logs = list(runtime.directory.glob('*.log'))
            self.assertTrue(any('unable to read' in path.read_text() for path in logs))

    def test_remote_retry_failure_propagates_after_removing_partial_clone(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local = root / 'workspace' / 'app'
            local.mkdir(parents=True)
            destination = root / 'output' / 'app'
            commands = []

            class Fake:
                def event(self, message):
                    pass

                def run(self, args, **kwargs):
                    commands.append(args)
                    if args[1] == '-C':
                        return 'https://github.com/owner/app.git'
                    if '--reference-if-able' in args:
                        destination.mkdir(parents=True)
                        (destination / 'partial').write_text('incomplete')
                        raise RuntimeError('cache unreadable')
                    assert not destination.exists()
                    assert '--dissociate' not in args
                    raise RuntimeError('remote unavailable')

            with self.assertRaisesRegex(RuntimeError, 'remote unavailable'):
                clone(Fake(), {'repository': 'owner/app'}, root / 'workspace', root / 'output')
            self.assertEqual(len(commands), 3)
            self.assertTrue(local.is_dir())
            self.assertFalse(destination.exists())

    def test_existing_destination_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'app').mkdir()
            marker = root / 'app' / 'retained'
            marker.write_text('existing work')
            with self.assertRaises(FileExistsError):
                clone(None, {'repository': 'owner/app'}, root / 'workspace', root)
            self.assertEqual(marker.read_text(), 'existing work')

    def test_cancelled_clone_is_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'workspace' / 'app').mkdir(parents=True)

            class Fake:
                def run(self, args, **kwargs):
                    if args[1] == '-C':
                        return 'https://github.com/owner/app.git'
                    raise CancelledError('stopped')

                def event(self, message):
                    raise AssertionError('Cancellation must not trigger retry')

            with self.assertRaises(CancelledError):
                clone(Fake(), {'repository': 'owner/app'}, root / 'workspace', root / 'output')


if __name__ == '__main__':
    unittest.main()

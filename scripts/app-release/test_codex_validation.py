"""Fresh Codex clones need the source's pinned build and SDK prerequisites."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from release_builds import prepare_codex_validation


class CodexValidationTest(unittest.TestCase):
    def test_source_resolves_v8_before_frozen_sdk_install(self):
        calls = []
        environment = {'EXISTING': 'preserved'}

        class Runtime:
            def __init__(self):
                self.environment = environment

            def run(self, args, cwd=None):
                calls.append((args, cwd, dict(self.environment)))
                return json.dumps({'RUSTY_V8_ARCHIVE': 'verified-archive',
                                   'RUSTY_V8_SRC_BINDING_PATH': 'verified-binding'})

        source = Path('source')
        with patch.dict(os.environ, {'CARGO_TARGET_DIR': ''}), patch('release_builds.native_target', return_value='native-target'):
            prepare_codex_validation(Runtime(), source)
        self.assertEqual(len(calls), 2)
        self.assertIn('resolve_codex_v8_cargo_env', calls[0][0][3])
        self.assertEqual(calls[0][0][-1], 'native-target')
        self.assertEqual(calls[0][1], source)
        self.assertEqual(calls[1], (['pnpm', 'install', '--frozen-lockfile'], source, environment))
        self.assertEqual(environment['EXISTING'], 'preserved')
        self.assertEqual(environment['RUSTY_V8_ARCHIVE'], 'verified-archive')

    def test_requested_cargo_cache_matches_gate_executable_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            (source / 'codex-rs').mkdir(parents=True)
            cache = root / 'cache'

            class Runtime:
                environment = {'CARGO_TARGET_DIR': str(cache)}

                def run(self, args, cwd=None):
                    return '{}'

            prepare_codex_validation(Runtime(), source)
            executable = cache / 'debug/codex'
            executable.parent.mkdir()
            executable.write_bytes(b'fixture executable')
            self.assertEqual((source / 'codex-rs/target/debug/codex').read_bytes(), b'fixture executable')
            self.assertEqual((source / 'codex-rs/target').resolve(), cache)

    def test_unverified_v8_stops_before_sdk_install(self):
        calls = []

        class Runtime:
            environment = {}

            def run(self, args, cwd=None):
                calls.append(args)
                raise RuntimeError('V8 checksum mismatch')

        with patch.dict(os.environ, {'CARGO_TARGET_DIR': ''}), self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
            prepare_codex_validation(Runtime(), Path('source'))
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()

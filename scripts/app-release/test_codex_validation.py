"""Fresh Codex clones need the source's pinned build and SDK prerequisites."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from release_builds import prepare_codex_validation
from release_runtime import Runtime


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
        self.assertEqual(environment['CODEX_REPO_ROOT'], str(source.resolve()))

    def test_source_import_receives_its_required_repository_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            package = source / 'scripts/codex_package'
            package.mkdir(parents=True)
            (package / 'targets.py').write_text(
                'import os\nfrom pathlib import Path\n'
                'assert Path(os.environ["CODEX_REPO_ROOT"]) == Path.cwd()\n'
                'TARGET_SPECS = {"native-target": "fixture"}\n')
            (package / 'v8.py').write_text(
                'def resolve_codex_v8_cargo_env(spec):\n'
                '    assert spec == "fixture"\n'
                '    return {"RUSTY_V8_ARCHIVE": "verified-archive"}\n')

            class SourceRuntime(Runtime):
                def run(self, args, **kwargs):
                    if args[0] == 'pnpm':
                        return ''
                    return super().run(args, **kwargs)

            runtime = SourceRuntime(root / 'logs')
            with patch.dict(os.environ, {'CARGO_TARGET_DIR': ''}), patch('release_builds.native_target', return_value='native-target'):
                prepare_codex_validation(runtime, source)
            self.assertEqual(runtime.environment['RUSTY_V8_ARCHIVE'], 'verified-archive')

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
            self.assertFalse((source / 'codex-rs/target').is_symlink())
            self.assertEqual((source / 'codex-rs/target/debug').resolve(), cache / 'debug')

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

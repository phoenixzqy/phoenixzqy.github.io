"""Release validation uses dependencies independent of the operator's home."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from release_builds import build, validation_python


class ValidationPythonTest(unittest.TestCase):
    def test_cli_sets_up_documented_environment_on_each_platform(self):
        source = Path('source')
        for platform, executable in (('linux', 'bin/python'), ('darwin', 'bin/python'),
                                     ('win32', 'Scripts/python.exe')):
            with self.subTest(platform=platform), patch('release_builds.sys.platform', platform):
                calls = []

                class Runtime:
                    def run(self, args, cwd=None):
                        calls.append((args, cwd))

                interpreter = validation_python(Runtime(), source, 'zai-cli')
                self.assertEqual(interpreter, source / '.venv-local-ci' / executable)
                self.assertEqual(calls, [
                    ([sys.executable, '-B', '-m', 'venv', source / '.venv-local-ci'], source),
                    ([interpreter, '-B', '-m', 'pip', 'install', '-r',
                      '.github/skills/performance-measurement/requirements.txt'], source),
                ])

    def test_setup_failure_stops_before_gate_or_packaging(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []

            class Runtime:
                def run(self, args, cwd=None):
                    calls.append(args)
                    if 'pip' in args:
                        raise RuntimeError('dependency setup failed')

            runtime = Runtime()
            with self.assertRaisesRegex(RuntimeError, 'dependency setup failed'):
                build(runtime, root, {'repository': 'owner/zai-cli'}, '1.0.0',
                      root / 'output', root / 'site', None)
            self.assertEqual(runtime.stage, 'zai-cli:validation')
            self.assertEqual(len(calls), 2)

    def test_other_adapters_keep_their_existing_interpreter(self):
        class Runtime:
            def run(self, *args, **kwargs):
                raise AssertionError('unexpected environment setup')

        for name in ('zai-editor', 'zai-gitter', 'zai-codex'):
            self.assertEqual(validation_python(Runtime(), Path('source'), name), sys.executable)

    def test_frontend_setup_precedes_full_gate_and_gui_required_packager(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []

            class Runtime:
                def run(self, args, cwd=None):
                    calls.append((args, cwd))
                    if 'src/scripts/release_manifest.py' in args:
                        (root / 'output/manifest.json').write_text('{"release":{"assets":[]}}')

            with patch('release_builds.verify_browser_gui_release') as verify:
                build(Runtime(), root, {'repository': 'owner/zai-cli'}, '1.0.0',
                      root / 'output', root / 'site', None)
            self.assertEqual(calls[2], (['npm', 'ci', '--no-audit', '--no-fund'], root / 'src/web-ui'))
            self.assertEqual(calls[3][0][-1], '.github/scripts/local_ci.py')
            self.assertEqual(calls[4][0], [sys.executable, '-B', 'src/scripts/release_build.py',
                '--version', '1.0.0', '--output', root / 'output', '--locked-tools', '--require-desktop'])
            verify.assert_called_once()

    def test_frontend_or_gate_failure_never_reaches_packaging(self):
        for failing in ('ci', '.github/scripts/local_ci.py'):
            with self.subTest(failing=failing), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                calls = []

                class Runtime:
                    def run(self, args, cwd=None):
                        calls.append(args)
                        if failing in args:
                            raise RuntimeError('validation failed')

                with self.assertRaisesRegex(RuntimeError, 'validation failed'):
                    build(Runtime(), root, {'repository': 'owner/zai-cli'}, '1.0.0',
                          root / 'output', root / 'site', None)
                self.assertFalse(any('src/scripts/release_build.py' in args for args in calls))

    def test_environment_packages_survive_isolated_home(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = root / 'environment'
            subprocess.run([sys.executable, '-B', '-m', 'venv', '--without-pip', environment], check=True)
            interpreter = environment / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
            command = [interpreter, '-B', '-c']
            site = Path(subprocess.check_output(
                [*command, 'import sysconfig; print(sysconfig.get_path("purelib"))'], text=True).strip())
            (site / 'validation_dependency.py').write_text('VALUE = 42\n')
            home = root / 'isolated-home'
            home.mkdir()
            result = subprocess.check_output(
                [*command, 'import validation_dependency; print(validation_dependency.VALUE)'],
                env=dict(os.environ, HOME=str(home), USERPROFILE=str(home), PYTHONNOUSERSITE='1'),
                text=True)
            self.assertEqual(result.strip(), '42')

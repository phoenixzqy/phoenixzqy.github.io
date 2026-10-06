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

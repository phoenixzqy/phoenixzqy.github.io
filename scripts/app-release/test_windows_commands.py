"""Windows Node launcher boundaries (no shell or forge writes)."""
import os
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from release_runtime import Runtime, command_argv


class WindowsCommandsTest(unittest.TestCase):
    def test_runtime_executes_node_cli_with_literals_and_keeps_exit_status(self):
        with tempfile.TemporaryDirectory(prefix='release-windows-') as directory:
            root = Path(directory)
            cli = root / 'node_modules/npm/bin'
            cli.mkdir(parents=True)
            launcher = root / 'npm.cmd'
            launcher.touch()
            (cli / 'npm-cli.js').write_text('console.log(JSON.stringify(process.argv.slice(2)));process.exit(7);')
            arguments = ['literal spaces', '& echo injected', '%TOKEN%', '"quoted"']
            runtime = Runtime(root / 'run')
            node = shutil.which('node')
            self.assertIsNotNone(node, 'Node.js is a repository test prerequisite')
            with patch('release_runtime.sys.platform', 'win32'), patch('release_runtime.shutil.which', side_effect=[str(launcher), node]):
                with self.assertRaisesRegex(RuntimeError, 'exited 7'):
                    runtime.run(['npm', *arguments])
            self.assertEqual(json.loads((runtime.directory / '0001.log').read_text()), arguments)

    def test_cmd_launchers_use_node_and_preserve_literal_arguments(self):
        with tempfile.TemporaryDirectory(prefix='release-windows-') as directory:
            root = Path(directory) / 'Node installation'
            cli = root / 'node_modules/npm/bin'
            cli.mkdir(parents=True)
            (root / 'node.exe').touch()
            for command in ('npm', 'npx'):
                (cli / f'{command}-cli.js').touch()
                launcher = root / f'{command}.cmd'
                launcher.touch()
                args = [command, 'run', 'argument with spaces', '& echo injected', '%TOKEN%', '"quoted"']
                with patch('release_runtime.sys.platform', 'win32'), patch('release_runtime.shutil.which', return_value=str(launcher)):
                    self.assertEqual(command_argv(args, {'PATH': directory}),
                                     [str(root / 'node.exe'), str(cli / f'{command}-cli.js'), *args[1:]])

    def test_missing_cli_fails_without_falling_back_to_a_shell(self):
        with tempfile.TemporaryDirectory(prefix='release-windows-') as directory:
            launcher = Path(directory) / 'npm.cmd'
            launcher.touch()
            with patch('release_runtime.sys.platform', 'win32'), patch('release_runtime.shutil.which', return_value=str(launcher)):
                with self.assertRaisesRegex(FileNotFoundError, 'standard npm CLI'):
                    command_argv(['npm', 'ci'], {'PATH': directory})

    def test_other_commands_and_posix_argv_stay_literal(self):
        for platform, args in [('linux', ['npm', 'ci']), ('win32', ['git', 'status'])]:
            with patch('release_runtime.sys.platform', platform), patch('release_runtime.shutil.which') as which:
                self.assertEqual(command_argv(args, dict(os.environ)), args)
                which.assert_not_called()

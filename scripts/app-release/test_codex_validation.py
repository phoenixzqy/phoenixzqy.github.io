"""Codex releases use native package checks; other apps retain source validation."""
import json
import os
import shutil
import subprocess
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from release_builds import build
from release_packages import digest
from release_publish import publish, recover


class CodexValidationTest(unittest.TestCase):
    def run_codex_build(self, directory, *, failure=None, member='codex'):
        root = Path(directory)
        source, output, site, notices = (root / name for name in ('source', 'output', 'site', 'notices'))
        notices.mkdir()
        (notices / 'LICENSE.txt').write_text('Reviewed fixture notice')
        calls = []

        class Runtime:
            stage = ''

            def run(self, args, cwd=None):
                calls.append((args, cwd, self.stage))
                if args[:3] == [sys.executable, '-B', 'scripts/prepare_zai_codex_release.py']:
                    if failure:
                        raise RuntimeError(failure)
                    with zipfile.ZipFile(output / 'zai-codex-0.1.1-x86_64-unknown-linux-gnu.zip', 'w') as archive:
                        archive.writestr(member, b'native package fixture')
                elif args[0] not in ('node', 'npm'):
                    raise AssertionError(f'Unexpected release command: {args}')
                return ''

        with patch('release_builds.native_target', return_value='x86_64-unknown-linux-gnu'), patch('release_builds.platform.system', return_value='Linux'):
            data = build(Runtime(), source, {'repository': 'owner/zai-codex', 'site_repository': 'owner/site'},
                         '0.1.1', output, site, notices)
        return data, calls, output

    def test_native_packaging_and_installer_sync_verify_final_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            data, calls, output = self.run_codex_build(directory)
            root = Path(directory)
            self.assertEqual(calls, [
                ([sys.executable, '-B', 'scripts/prepare_zai_codex_release.py', '--version', '0.1.1',
                  '--third-party-notices', root / 'notices', '--output', output], root / 'source', 'zai-codex:build'),
                (['node', 'scripts/sync-zai-codex-installer.mjs', root / 'source'], root / 'site', 'zai-codex:build'),
                (['npm', 'run', 'build:installers'], root / 'site', 'zai-codex:build'),
            ])
            asset, = data['release']['assets']
            archive = output / asset['file']
            self.assertEqual(asset['bytes'], archive.stat().st_size)
            self.assertEqual(asset['sha256'], digest(archive))
            self.assertEqual(json.loads((output / 'manifest.json').read_text()), data)
            self.assertIn('does not rerun the full source test suite', data['release']['notes'][1])

    def test_packager_failure_stops_the_release(self):
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(RuntimeError, 'native smoke failed'):
            self.run_codex_build(directory, failure='native smoke failed')

    def test_private_package_contents_still_stop_the_release(self):
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(ValueError, 'Private/debug artifact'):
            self.run_codex_build(directory, member='auth.json')

    def test_missing_reviewed_notices_stop_before_packaging(self):
        class Runtime:
            def run(self, *args, **kwargs):
                raise AssertionError('Missing notices must stop before running commands')

        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(ValueError, 'reviewed dependency notices'):
            root = Path(directory)
            build(Runtime(), root / 'source', {'repository': 'owner/zai-codex'},
                  '0.1.1', root / 'output', root / 'site', None)

    def test_other_apps_still_stop_on_source_gate_failure(self):
        for name in ('zai-cli', 'zai-editor', 'zai-gitter'):
            calls = []

            class Runtime:
                stage = ''

                def run(self, args, cwd=None):
                    calls.append((args, cwd, self.stage))
                    raise RuntimeError('source gate failed')

            with self.subTest(app=name), tempfile.TemporaryDirectory() as directory, patch('release_builds.validation_python', return_value='gate-python'), self.assertRaisesRegex(RuntimeError, 'source gate failed'):
                root = Path(directory)
                build(Runtime(), root / 'source', {'repository': f'owner/{name}'},
                      '0.1.1', root / 'output', root / 'site', None)
            self.assertEqual(calls, [(['gate-python', '-B', '.github/scripts/local_ci.py'], root / 'source', f'{name}:validation')])

    def test_recovery_reuses_uploaded_bytes_and_restores_installer_without_build(self):
        for failure in (None, 'hash', 'missing', 'provenance', 'installer'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / 'original.zip'
                with zipfile.ZipFile(archive, 'w') as bundle:
                    bundle.writestr('codex', b'verified native package')
                asset = {'file': 'asset.zip', 'bytes': archive.stat().st_size, 'sha256': digest(archive)}
                snapshot = {'commit': 'a' * 40, 'dependencies': {}}
                data = {'appId': 'zai-codex', 'release': {'version': '0.1.1', 'assets': [asset]}}
                journal = {'app': 'zai-codex', 'tag': 'zai-codex-v0.1.1',
                           'snapshot': snapshot, 'manifest': data}
                release = {'id': 10, 'tag_name': journal['tag'], 'draft': False,
                           'body': 'Source `' + ('b' if failure == 'provenance' else 'a') * 40 + '`',
                           'assets': [] if failure == 'missing' else [{'name': 'asset.zip'}]}
                output = root / 'output'
                events = []

                class Runtime:
                    site_repository = 'owner/site'
                    stage = ''

                    def run(self, args, **kwargs):
                        self_test.assertEqual(args[:3], ['gh', 'release', 'download'])
                        events.append('download')
                        (output / 'asset.zip').write_bytes(b'changed' if failure == 'hash' else archive.read_bytes())

                self_test = self

                def restore():
                    events.append('installer')
                    if failure == 'installer':
                        raise RuntimeError('installer restoration failed')

                def rebuild():
                    raise AssertionError('Codex recovery must never rebuild or run source tests')

                with patch('release_publish.release_by_tag', return_value=release), patch('release_publish.finish') as finish:
                    if failure:
                        with self.assertRaises((ValueError, RuntimeError)):
                            recover(Runtime(), root, root / 'journal.json', journal, output,
                                    rebuild, restore_installer=restore)
                        finish.assert_not_called()
                    else:
                        recover(Runtime(), root, root / 'journal.json', journal, output,
                                rebuild, restore_installer=restore)
                        finish.assert_called_once()
                        self.assertEqual(events, ['download', 'installer'])
                        self.assertEqual((output / 'asset.zip').read_bytes(), archive.read_bytes())

    def test_recovery_restores_installer_from_recorded_merged_revision(self):
        from argparse import Namespace
        from release_apps import restore_codex_installer
        snapshot = {'repository': 'owner/zai-codex', 'branch': 'zai-codex', 'commit': 'a' * 40}
        calls = []

        class Runtime:
            def run(self, args, **kwargs):
                calls.append((args, kwargs))

        with patch('release_apps.clone', return_value=Path('source')) as clone:
            restore_codex_installer(Runtime(), Namespace(workspace=Path('workspace')),
                                    {'snapshot': snapshot}, Path('root'), Path('site'))
        self.assertEqual(clone.call_args.args[1:], (snapshot, Path('workspace'), Path('root')))
        self.assertEqual(clone.call_args.kwargs, {'recovery': True})
        self.assertEqual(calls, [
            (['node', 'scripts/sync-zai-codex-installer.mjs', Path('source'), '--release'], {'cwd': Path('site')}),
            (['npm', 'run', 'build:installers'], {'cwd': Path('site')}),
        ])

    def test_installer_sync_accepts_only_merged_recovery_commits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, site = root / 'source', root / 'site'
            source.mkdir()
            (site / 'scripts').mkdir(parents=True)
            (site / 'install/templates').mkdir(parents=True)
            script = Path(__file__).resolve().parents[1] / 'sync-zai-codex-installer.mjs'
            shutil.copyfile(script, site / 'scripts' / script.name)
            environment = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}

            def git(*args):
                return subprocess.check_output(['git', '-C', str(source), *args],
                                               env=environment, text=True).strip()

            git('init', '--initial-branch=zai-codex')
            git('remote', 'add', 'origin', 'https://github.com/phoenixzqy/zai-codex.git')
            (source / 'scripts').mkdir()
            installer = source / 'scripts/install_zai_codex.py'
            installer.write_text('# reviewed installer\n')
            git('add', '.')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
                '-c', 'commit.gpgsign=false', 'commit', '-m', 'reviewed source')
            recorded = git('rev-parse', 'HEAD')
            installer.write_text('# newer installer\n')
            git('add', '.')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
                '-c', 'commit.gpgsign=false', 'commit', '-m', 'new source')
            git('update-ref', 'refs/remotes/origin/zai-codex', 'HEAD')
            git('checkout', '--detach', recorded)
            command = ['node', str(site / 'scripts' / script.name), str(source)]
            result = subprocess.run(command, env=environment, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            subprocess.run(command + ['--release'], env=environment, check=True, capture_output=True)
            self.assertEqual((site / 'install/templates/zai-codex.py.in').read_text(), '# reviewed installer\n')
            self.assertEqual(json.loads((site / 'install/zai-codex-source.json').read_text())['commit'], recorded)
            git('update-ref', 'refs/remotes/origin/zai-codex', recorded)
            git('checkout', 'zai-codex')
            result = subprocess.run(command + ['--release'], env=environment, capture_output=True)
            self.assertNotEqual(result.returncode, 0, 'Unmerged source must not become a recovered release')

    def test_public_release_notes_describe_package_validation_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = {'repository': 'owner/zai-codex', 'branch': 'zai-codex',
                        'commit': 'a' * 40, 'dependencies': {}}
            data = {'appId': 'zai-codex', 'release': {'version': '0.1.1', 'assets': []}}
            bodies = []

            class Runtime:
                site_repository = 'owner/site'

                def run(self, args, **kwargs):
                    if args[0] == 'git':
                        return 'b' * 40
                    if args[:3] == ['gh', 'api', '--method']:
                        bodies.append(json.loads(Path(args[-1]).read_text())['body'])
                        return json.dumps({'id': 10, 'tag_name': 'zai-codex-v0.1.1'})
                    return ''

            with patch('release_publish.validate_metadata'), patch('release_publish.finish'):
                publish(Runtime(), snapshot, data, root, root, root / 'journal.json', {})
            self.assertEqual(len(bodies), 1)
            self.assertIn('Native build and package smoke checks passed', bodies[0])
            self.assertIn('did not rerun the full source test suite', bodies[0])


if __name__ == '__main__':
    unittest.main()

"""Codex releases use native package checks; other apps retain source validation."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from release_builds import build
from release_packages import digest
from release_publish import publish


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

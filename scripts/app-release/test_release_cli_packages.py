"""Exercise complete and tampered cross-platform GUI archives; no source execution."""
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile

from release_cli_packages import TARGETS, sha256, verify_browser_gui_release
from release_packages import digest, verify_file


def package(directory, pair, *, modify=None, payload_modify=None):
    platform, architecture = pair
    suffix = '.exe' if platform == 'windows' else ''
    prefix = 'zai.app/Contents/MacOS/' if platform == 'macos' else ''
    components = {prefix + binary + suffix: b'executable' for binary in ('zai-desktop', 'zai-desktop-runtime')}
    components.update({prefix + 'web/index.html': b'<html>production</html>',
                       prefix + 'web/assets/main.js': b'javascript',
                       prefix + 'web/assets/main.css': b'styles',
                       'licenses/symbols-nerd-font/LICENSE': b'license',
                       'licenses/symbols-nerd-font/LICENSE-sources': b'notices'})
    if platform == 'macos':
        components['zai.app/Contents/Info.plist'] = plistlib.dumps({
            'CFBundleExecutable': 'zai-desktop', 'CFBundlePackageType': 'APPL'})
        components['zai.app/Contents/Resources/icon.icns'] = b'icon'
    if platform == 'linux':
        components['icon.png'] = b'icon'
    wrapper = b'cli executable'
    payload = {'protocol': 1, 'target': TARGETS[pair], 'cli_sha256': sha256(wrapper),
               'files': {name: sha256(value) for name, value in components.items()}}
    if payload_modify:
        payload_modify(payload)
    files = {'zai' + suffix: wrapper, 'install.py': b'raise AssertionError("Never execute archive code")',
             **{'desktop/' + name: body for name, body in components.items()}}
    files['desktop/desktop-manifest.json'] = json.dumps(payload).encode()
    if modify:
        modify(files)
    path = directory / f'zai-1.0.0-{platform}-{architecture}.zip'
    with zipfile.ZipFile(path, 'w') as archive:
        for name, value in files.items():
            archive.writestr(name, value)
    return {'file': path.name, 'bytes': path.stat().st_size, 'sha256': digest(path),
            'platform': platform, 'architecture': architecture}


class BrowserGuiPackagesTest(unittest.TestCase):
    def test_all_six_targets_pass_inventory_cli_and_bundle_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = [package(root, pair) for pair in TARGETS]
            verify_browser_gui_release({'appId': 'zai-cli', 'release': {'assets': assets}}, root)

    def test_new_releases_reject_missing_duplicate_or_cli_only_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = [package(root, pair) for pair in TARGETS]
            for selection in (assets[:-1], [assets[0], *assets[:-1]]):
                with self.assertRaisesRegex(ValueError, 'all six'):
                    verify_browser_gui_release({'appId': 'zai-cli', 'release': {'assets': selection}}, root)
            assets[0] = package(root, ('linux', 'x64'), modify=lambda files: [files.pop(name)
                               for name in list(files) if name.startswith('desktop/')])
            with self.assertRaisesRegex(ValueError, 'missing its bounded desktop manifest'):
                verify_browser_gui_release({'appId': 'zai-cli', 'release': {'assets': assets}}, root)

    def test_gui_payload_checks_also_apply_to_recovered_or_downloaded_assets(self):
        mutations = (
            ('target', None, lambda payload: payload.update(target='aarch64-unknown-linux-gnu')),
            ('CLI', lambda files: files.update(zai=b'another CLI'), None),
            ('cover every', lambda files: files.update({'desktop/unlisted': b'new component'}), None),
            ('cover every', lambda files: files.pop('desktop/web/index.html'), None),
            ('failed verification', lambda files: files.update({'desktop/web/assets/main.js': b'changed'}), None),
            ('missing required', None, lambda payload: payload['files'].pop('licenses/symbols-nerd-font/LICENSE')),
            ('Invalid browser GUI inventory', None, lambda payload: payload['files'].update({'web/assets/main.js': 'bad'})),
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for message, modify, payload_modify in mutations:
                with self.subTest(message=message):
                    asset = package(root, ('linux', 'x64'), modify=modify, payload_modify=payload_modify)
                    with self.assertRaisesRegex(ValueError, message):
                        verify_file(root / asset['file'], asset)

    def test_production_assets_and_native_bundle_are_required(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for suffix in ('.js', '.css'):
                def remove_assets(files):
                    payload = json.loads(files['desktop/desktop-manifest.json'])
                    for name in list(payload['files']):
                        if name.endswith(suffix):
                            del payload['files'][name]
                            del files['desktop/' + name]
                    files['desktop/desktop-manifest.json'] = json.dumps(payload).encode()
                asset = package(root, ('linux', 'arm64'), modify=remove_assets)
                with self.assertRaisesRegex(ValueError, 'missing production'):
                    verify_file(root / asset['file'], asset)
            asset = package(root, ('macos', 'arm64'), payload_modify=lambda payload:
                            payload['files'].pop('zai.app/Contents/Resources/icon.icns'))
            with self.assertRaisesRegex(ValueError, 'missing required'):
                verify_file(root / asset['file'], asset)

    def test_legacy_cli_only_recovery_and_retention_remain_compatible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            asset = package(root, ('linux', 'x64'), modify=lambda files: [files.pop(name)
                            for name in list(files) if name.startswith('desktop/')])
            verify_file(root / asset['file'], asset)
            with self.assertRaisesRegex(ValueError, 'missing its bounded desktop manifest'):
                verify_file(root / asset['file'], asset, require_browser_gui=True)

    def test_existing_tauri_inventory_without_external_web_assets_remains_valid(self):
        # The immutable 0.1.600 Linux inventory embeds its UI in the Tauri binary.
        def legacy_desktop(files):
            payload = json.loads(files['desktop/desktop-manifest.json'])
            for name in list(payload['files']):
                if name.startswith('web/'):
                    del payload['files'][name]
                    del files['desktop/' + name]
            files['desktop/desktop-manifest.json'] = json.dumps(payload).encode()

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            asset = package(root, ('linux', 'x64'), modify=legacy_desktop)
            verify_file(root / asset['file'], asset)
            with self.assertRaisesRegex(ValueError, 'missing required'):
                verify_file(root / asset['file'], asset, require_browser_gui=True)


if __name__ == '__main__':
    unittest.main()

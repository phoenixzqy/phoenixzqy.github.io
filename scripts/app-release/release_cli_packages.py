"""Verify the browser GUI payload without executing downloaded package code."""
from __future__ import annotations

import hashlib
import json
from pathlib import PurePosixPath
import plistlib
import re
import stat
import zipfile


TARGETS = {
    ('linux', 'x64'): 'x86_64-unknown-linux-gnu',
    ('linux', 'arm64'): 'aarch64-unknown-linux-gnu',
    ('macos', 'x64'): 'x86_64-apple-darwin',
    ('macos', 'arm64'): 'aarch64-apple-darwin',
    ('windows', 'x64'): 'x86_64-pc-windows-msvc',
    ('windows', 'arm64'): 'aarch64-pc-windows-msvc',
}
MARKER = 'desktop/desktop-manifest.json'


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verify_browser_gui_archive(path, asset, *, required=False):
    """Existing CLI-only releases remain valid for immutable recovery/retention."""
    with zipfile.ZipFile(path) as archive:
        entries = {entry.filename: entry for entry in archive.infolist() if not entry.is_dir()}
        if not required and not any(name.startswith('desktop/') for name in archive.namelist()):
            return
        pair = (asset.get('platform'), asset.get('architecture'))
        if pair not in TARGETS:
            raise ValueError('Browser GUI package has an unsupported platform/architecture')
        marker = entries.get(MARKER)
        if marker is None or marker.file_size > 1024 * 1024:
            raise ValueError('Browser GUI package is missing its bounded desktop manifest')
        payload = json.loads(archive.read(marker))
        if (not isinstance(payload, dict) or set(payload) != {'protocol', 'target', 'cli_sha256', 'files'}
                or type(payload['protocol']) is not int or payload['protocol'] != 1
                or payload['target'] != TARGETS[pair]):
            raise ValueError('Browser GUI manifest does not match the advertised target')
        suffix = '.exe' if pair[0] == 'windows' else ''
        wrapper = 'zai' + suffix
        if wrapper not in entries or sha256(archive.read(wrapper)) != payload['cli_sha256']:
            raise ValueError('Browser GUI manifest does not match its packaged CLI')
        prefix = 'zai.app/Contents/MacOS/' if pair[0] == 'macos' else ''
        required_files = {prefix + binary + suffix for binary in ('zai-desktop', 'zai-desktop-runtime')}
        declared = payload['files']
        browser_gui = required or (isinstance(declared, dict) and any(
            name.startswith(prefix + 'web/') for name in declared))
        required_files.update({'licenses/symbols-nerd-font/LICENSE',
                               'licenses/symbols-nerd-font/LICENSE-sources'})
        if browser_gui:
            required_files.add(prefix + 'web/index.html')
        if pair[0] == 'macos':
            required_files.update({'zai.app/Contents/Info.plist', 'zai.app/Contents/Resources/icon.icns'})
        if pair[0] == 'linux':
            required_files.add('icon.png')
        if not isinstance(declared, dict) or len(declared) > 4096 or not required_files <= declared.keys():
            raise ValueError('Browser GUI manifest is missing required applications, web assets or licenses')
        actual = {name.removeprefix('desktop/') for name in entries if name.startswith('desktop/') and name != MARKER}
        if actual != declared.keys() or '.installed-files.json' in actual:
            raise ValueError('Browser GUI manifest must cover every packaged component')
        for name, checksum in declared.items():
            if (not isinstance(name, str) or not name or PurePosixPath(name).is_absolute()
                    or any(part in ('', '.', '..') for part in name.split('/')) or '\\' in name or ':' in name
                    or not isinstance(checksum, str) or re.fullmatch('[a-f0-9]{64}', checksum) is None):
                raise ValueError('Invalid browser GUI inventory entry')
            entry = entries['desktop/' + name]
            if stat.S_ISLNK(entry.external_attr >> 16) or not entry.file_size or sha256(archive.read(entry)) != checksum:
                raise ValueError(f'Browser GUI component failed verification: {name}')
        web_assets = prefix + 'web/assets/'
        if browser_gui and not any(name.startswith(web_assets) and name.endswith('.js') for name in declared):
            raise ValueError('Browser GUI package is missing production JavaScript assets')
        if browser_gui and not any(name.startswith(web_assets) and name.endswith('.css') for name in declared):
            raise ValueError('Browser GUI package is missing production stylesheet assets')
        if pair[0] == 'macos':
            info = plistlib.loads(archive.read('desktop/zai.app/Contents/Info.plist'))
            if info.get('CFBundleExecutable') != 'zai-desktop' or info.get('CFBundlePackageType') != 'APPL':
                raise ValueError('Browser GUI macOS bundle has an invalid launcher')


def verify_browser_gui_release(data, directory):
    from release_packages import verify_file
    assets = data['release']['assets']
    pairs = [(asset.get('platform'), asset.get('architecture')) for asset in assets]
    if data['appId'] != 'zai-cli' or len(pairs) != len(TARGETS) or set(pairs) != set(TARGETS):
        raise ValueError('New zai-cli releases require all six browser GUI targets exactly once')
    for asset in assets:
        verify_file(directory / asset['file'], asset, require_browser_gui=True)

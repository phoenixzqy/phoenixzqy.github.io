"""Publish the license material from the final verified Codex archives."""
import json
import zipfile

from release_packages import verify_file


def notices_text(data, output, expected_commit):
    version = data['release']['version']
    sections = [f"zai-codex {version} — license and third-party notices\nSource commit: {expected_commit}\n"]
    notices = {}
    for asset in data['release']['assets']:
        package = output / asset['file']
        verify_file(package, asset)
        with zipfile.ZipFile(package) as archive:
            provenance = json.loads(archive.read('zai-release.json'))
            if provenance['commit'] != expected_commit or provenance['version'] != version:
                raise ValueError('Codex notice package provenance does not match this release')
            names = sorted(name for name in archive.namelist() if not name.endswith('/') and (
                name in ('LICENSE', 'NOTICE', 'MODIFICATIONS.txt') or name.startswith('third-party-notices/')))
            if not any(name.startswith('third-party-notices/') for name in names):
                raise ValueError('Codex archive has no third-party notices')
            if sum(archive.getinfo(name).file_size for name in names) > 10 * 1024 * 1024:
                raise ValueError('Codex license material exceeds the publication size limit')
            for name in names:
                body = archive.read(name).decode('utf-8')
                notices.setdefault((name, body), []).append(asset['file'])
    for (name, body), packages in notices.items():
        sections.append(f'\n===== {name} =====\nPackages: {", ".join(packages)}\n\n{body}\n')
    return '\n'.join(sections)

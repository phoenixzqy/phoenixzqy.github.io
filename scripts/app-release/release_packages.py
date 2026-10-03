"""Reject private/debug companions and verify the exact final package bytes."""
from __future__ import annotations

import hashlib
from pathlib import PurePosixPath
import stat
import posixpath
import zipfile
import urllib.request

DEBUG_SUFFIXES = ('.map', '.pdb', '.debug', '.symbols', '.dsym', '.dwo', '.dwp', '.sym', '.dbg')


def inspect_archive(path):
    with zipfile.ZipFile(path) as archive:
        seen = set()
        links = {entry.filename.rstrip('/') for entry in archive.infolist() if stat.S_ISLNK(entry.external_attr >> 16)}
        for entry in archive.infolist():
            member = PurePosixPath(entry.filename)
            parts = member.parts
            if any(parent.as_posix() in links for parent in member.parents):
                raise ValueError(f'Archive writes through a symlink ancestor: {entry.filename}')
            if member.as_posix() != entry.filename.rstrip('/') or ':' in entry.filename:
                raise ValueError(f'Noncanonical archive member: {entry.filename}')
            if (entry.filename in seen or entry.filename.startswith('/') or '..' in parts or
                    '\\' in entry.filename):
                raise ValueError(f'Unsafe member in {path.name}: {entry.filename}')
            if stat.S_ISLNK(entry.external_attr >> 16):
                target = archive.read(entry).decode('utf-8')
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(entry.filename), target))
                if target.startswith('/') or '\\' in target or ':' in target or '..' in PurePosixPath(target).parts or resolved == '..' or resolved.startswith('../'):
                    raise ValueError(f'Escaping archive symlink: {entry.filename}')
            seen.add(entry.filename)
            if any(p.lower().endswith(DEBUG_SUFFIXES) or p.lower() in {
                    'mapping.txt', 'obfuscation', 'debug-symbols', 'com.android.tools.build.debugsymbols', '.git', '.env',
                    'auth.json', 'credentials.json'} for p in parts):
                raise ValueError(f'Private/debug artifact in {path.name}: {entry.filename}')
        if archive.testzip():
            raise ValueError(f'Corrupt archive: {path.name}')


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def asset_name(asset):
    name = asset['file']
    if not isinstance(name, str) or not name or name in ('.', '..') or any(c in name for c in '/\\:'):
        raise ValueError('Asset file must be a plain basename')
    return name


def verify_file(path, asset):
    asset_name(asset)
    if path.stat().st_size != asset['bytes'] or digest(path) != asset['sha256']:
        raise ValueError(f'Package checksum/size mismatch: {path.name}')
    inspect_archive(path)


class HTTPSOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith('https://'):
            raise ValueError('Release download redirected outside HTTPS')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(asset, directory):
    path = directory / asset_name(asset)
    url = asset['url']
    if not url.startswith('https://github.com/'):
        raise ValueError('Expected public GitHub release download')
    opener = urllib.request.build_opener(HTTPSOnly())
    with opener.open(url, timeout=120) as response, path.open('wb') as output:
        size = 0
        while block := response.read(1024 * 1024):
            size += len(block)
            if size > asset['bytes']:
                raise ValueError('Downloaded package exceeds manifest size')
            output.write(block)
    verify_file(path, asset)
    return path

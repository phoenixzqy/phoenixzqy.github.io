#!/bin/sh
# Public one-line installer for the zai CLI on macOS and Linux.
#
#   curl -fsSL https://phoenixzqy.github.io/install/zai-cli.sh | sh
#
# A piped shell cannot observe a truncated transfer, so all work lives in a
# function that is only invoked on the final line of this file. A partial copy
# defines the function and exits without doing anything.
#
# The installer reads the published release manifest, downloads the archive for
# this platform into the system temporary directory, verifies its SHA-256
# before using it, and runs the package installer bundled in the archive. Every
# download is removed on success and on failure. Arguments are forwarded to the
# bundled installer; ZAI_INSTALL_DIR selects the install directory when
# --install-dir is not given.

zai_cli_install() {
    set -eu

    zai_cli_app_id='zai-cli'
    zai_cli_manifest_url="${ZAI_RELEASE_METADATA_URL:-https://phoenixzqy.github.io/releases/zai-cli/latest/manifest.json}"
    for zai_cli_tool in curl unzip; do
        if ! command -v "$zai_cli_tool" >/dev/null 2>&1; then
            echo "zai installer: '$zai_cli_tool' is required but was not found." >&2
            return 1
        fi
    done
    zai_cli_python=''
    for zai_cli_candidate in python3 python; do
        if command -v "$zai_cli_candidate" >/dev/null 2>&1; then
            zai_cli_python="$zai_cli_candidate"
            break
        fi
    done
    if [ -z "$zai_cli_python" ]; then
        echo "zai installer: Python 3.10 or newer is required but was not found." >&2
        return 1
    fi
    # Only a literal loopback test fixture may use HTTP; redirects stay HTTPS.
    zai_cli_protocols="$("$zai_cli_python" -c '
import sys
from urllib.parse import urlsplit
url = urlsplit(sys.argv[1])
try:
    _ = url.port
except ValueError:
    sys.exit("zai installer: invalid manifest URL port.")
if url.scheme not in ("https", "http") or not url.hostname or url.username or url.password:
    sys.exit("zai installer: downloads must use HTTPS (except loopback test fixtures).")
if url.scheme == "http" and url.hostname != "127.0.0.1":
    sys.exit("zai installer: downloads must use HTTPS (except loopback test fixtures).")
print("=https,http" if url.scheme == "http" else "=https")
' "$zai_cli_manifest_url")" || return 1

    zai_cli_work="$(mktemp -d "${TMPDIR:-/tmp}/zai-cli-install.XXXXXX")"
    # Remove the staging directory however this shell leaves the installer.
    trap 'rm -rf "$zai_cli_work"' EXIT
    trap 'rm -rf "$zai_cli_work"; exit 130' INT
    trap 'rm -rf "$zai_cli_work"; exit 143' TERM

    zai_cli_write_helper "$zai_cli_work/release_metadata.py"

    echo "Reading $zai_cli_manifest_url"
    if ! curl -fsSL --proto "$zai_cli_protocols" --proto-redir '=https' -o "$zai_cli_work/manifest.json" "$zai_cli_manifest_url"; then
        echo "zai installer: could not download the release manifest." >&2
        return 1
    fi

    zai_cli_selection="$(
        "$zai_cli_python" "$zai_cli_work/release_metadata.py" select \
            --manifest "$zai_cli_work/manifest.json" \
            --manifest-url "$zai_cli_manifest_url" \
            --app-id "$zai_cli_app_id" \
            --system "$(uname -s)" \
            --machine "$(uname -m)"
    )"
    zai_cli_file="$(printf '%s\n' "$zai_cli_selection" | sed -n 1p)"
    zai_cli_url="$(printf '%s\n' "$zai_cli_selection" | sed -n 2p)"
    zai_cli_sha256="$(printf '%s\n' "$zai_cli_selection" | sed -n 3p)"
    zai_cli_version="$(printf '%s\n' "$zai_cli_selection" | sed -n 4p)"

    echo "Downloading $zai_cli_app_id $zai_cli_version ($zai_cli_file)"
    if ! curl -fsSL --proto "$zai_cli_protocols" --proto-redir '=https' -o "$zai_cli_work/$zai_cli_file" "$zai_cli_url"; then
        echo "zai installer: could not download $zai_cli_url" >&2
        return 1
    fi

    "$zai_cli_python" "$zai_cli_work/release_metadata.py" verify \
        --archive "$zai_cli_work/$zai_cli_file" --sha256 "$zai_cli_sha256"

    mkdir "$zai_cli_work/package"
    unzip -q "$zai_cli_work/$zai_cli_file" -d "$zai_cli_work/package"
    if [ ! -f "$zai_cli_work/package/install.py" ]; then
        echo "zai installer: the release archive does not contain install.py." >&2
        return 1
    fi

    if [ -n "${ZAI_INSTALL_DIR:-}" ] && ! zai_cli_has_install_dir "$@"; then
        set -- --install-dir "$ZAI_INSTALL_DIR" "$@"
    fi
    "$zai_cli_python" "$zai_cli_work/package/install.py" "$@"
}

# The bundled installer's own --install-dir wins over the environment variable.
zai_cli_has_install_dir() {
    for zai_cli_argument in "$@"; do
        case "$zai_cli_argument" in
            --install-dir|--install-dir=*) return 0 ;;
        esac
    done
    return 1
}

zai_cli_write_helper() {
    cat >"$1" <<'ZAI_CLI_RELEASE_METADATA'
"""Select and verify one published release archive for this machine.

Written to the installer's staging directory and run with the same Python the
bundled package installer uses. It never downloads anything itself: the shell
performs the transfers so a proxy or credential helper configured for curl
still applies.
"""

import argparse
import hashlib
import json
import re
import sys
from urllib.parse import quote, unquote, urljoin

RELEASE_PREFIX = "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/"
PLATFORMS = {"linux": "linux", "darwin": "macos"}
ARCHITECTURES = {
    "x86_64": "x64",
    "amd64": "x64",
    "x64": "x64",
    "aarch64": "arm64",
    "arm64": "arm64",
}
PACKAGE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]*\.zip$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")


class ReleaseError(Exception):
    pass


def platform_identifiers(system, machine):
    platform = PLATFORMS.get(system.strip().lower())
    if platform is None:
        raise ReleaseError("No published package for this operating system: " + system)
    architecture = ARCHITECTURES.get(machine.strip().lower())
    if architecture is None:
        raise ReleaseError("No published package for this architecture: " + machine)
    return platform, architecture


def select(manifest, manifest_url, app_id, system, machine):
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1:
        raise ReleaseError("Unsupported release manifest schema.")
    if manifest.get("appId") != app_id:
        raise ReleaseError("The release manifest describes another application.")
    release = manifest.get("release")
    if release is None:
        raise ReleaseError("No public release has been published yet.")
    if not isinstance(release, dict):
        raise ReleaseError("Invalid release metadata.")
    platform, architecture = platform_identifiers(system, machine)
    for asset in release.get("assets") or []:
        if not isinstance(asset, dict):
            continue
        if asset.get("platform") != platform or asset.get("architecture") != architecture:
            continue
        return asset_download(asset, manifest_url), str(release.get("version", "")).strip()
    raise ReleaseError(
        "No published package for {0} {1} in this release.".format(platform, architecture)
    )


def asset_download(asset, manifest_url):
    name = asset.get("file")
    if not isinstance(name, str) or not PACKAGE.match(name) or "/" in name or "\\" in name:
        raise ReleaseError("The release manifest names an unsafe package file.")
    checksum = asset.get("sha256")
    if not isinstance(checksum, str) or not SHA256.match(checksum):
        raise ReleaseError("The release manifest has no usable SHA-256 for this package.")
    url = asset.get("url")
    if url is None:
        return name, urljoin(manifest_url, quote(name)), checksum
    if not isinstance(url, str) or not url.startswith(RELEASE_PREFIX):
        raise ReleaseError("Packages must be served from this project's public release downloads.")
    path = url[len(RELEASE_PREFIX):].split("/")
    if len(path) != 2 or "?" in url or "#" in url or unquote(path[1]) != name:
        raise ReleaseError("The release download URL does not match this package.")
    return name, url, checksum


def verify(path, expected):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    actual = digest.hexdigest()
    if actual != expected:
        raise ReleaseError(
            "Checksum mismatch: the download does not match the published SHA-256. "
            "Expected {0}, got {1}.".format(expected, actual)
        )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    selection = commands.add_parser("select")
    selection.add_argument("--manifest", required=True)
    selection.add_argument("--manifest-url", required=True)
    selection.add_argument("--app-id", required=True)
    selection.add_argument("--system", required=True)
    selection.add_argument("--machine", required=True)
    checksum = commands.add_parser("verify")
    checksum.add_argument("--archive", required=True)
    checksum.add_argument("--sha256", required=True)
    arguments = parser.parse_args(argv)
    if arguments.command == "verify":
        verify(arguments.archive, arguments.sha256)
        return 0
    with open(arguments.manifest, "rb") as stream:
        try:
            manifest = json.loads(stream.read().decode("utf-8"))
        except ValueError:
            raise ReleaseError("The release manifest is not valid JSON.")
    (name, url, digest), version = select(
        manifest, arguments.manifest_url, arguments.app_id, arguments.system, arguments.machine
    )
    print(name)
    print(url)
    print(digest)
    print(version)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReleaseError as error:
        sys.stderr.write("zai installer: {0}\n".format(error))
        raise SystemExit(1)
ZAI_CLI_RELEASE_METADATA
}

zai_cli_install "$@"

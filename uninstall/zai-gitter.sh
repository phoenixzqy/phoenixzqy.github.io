#!/bin/sh
# Generated from install/templates/. Requires Python 3.10+; no network at runtime.
set -eu
# Labels remain readable in pipes/logs; colour is only added to terminal stderr.
message() {
  message_level=$1
  shift
  message_colour=''
  if [ -t 2 ] && [ "${TERM:-dumb}" != dumb ] && [ "${NO_COLOR+x}" != x ]; then
    case "$message_level" in
      ERROR | FAIL) message_colour='1;31' ;;
      WARN) message_colour='1;33' ;;
      NEXT) message_colour='1;36' ;;
      OK) message_colour='1;32' ;;
    esac
  fi
  if [ -n "$message_colour" ]; then
    printf '\033[%sm[%s]\033[0m %s\n' "$message_colour" "$message_level" "$*" >&2
  else
    printf '[%s] %s\n' "$message_level" "$*" >&2
  fi
}
command -v python3 >/dev/null 2>&1 || { message ERROR 'Python 3.10+ is required to uninstall.'; message FAIL 'Uninstallation did not start.'; message NEXT 'Install Python from https://www.python.org/downloads/, open a new terminal, and rerun the uninstaller.'; exit 1; }
python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' || { message ERROR 'Python 3.10+ is required to uninstall.'; message FAIL 'Uninstallation did not start.'; message NEXT 'Install Python from https://www.python.org/downloads/, open a new terminal, and rerun the uninstaller.'; exit 1; }
python3 - "$@" <<'ZAI_UNINSTALL_PYTHON'
"""Remove zai-gitter and its user data without deleting sibling apps or worktrees."""

from __future__ import annotations

import argparse
import csv
from contextlib import contextmanager
import json
import os
import re
from pathlib import Path
import shutil
import stat
import subprocess
import sys

# Shared presentation only: installation/removal decisions belong to the app.
def zai_message(level, text):
    import os
    import sys

    colours = {"ERROR": "1;31", "FAIL": "1;31", "WARN": "1;33", "NEXT": "1;36", "OK": "1;32"}
    label = f"[{level}]"
    if sys.stderr.isatty() and os.environ.get("TERM") != "dumb" and "NO_COLOR" not in os.environ:
        colour = colours.get(level)
        if colour:
            label = f"\033[{colour}m{label}\033[0m"
    print(f"{label} {text}", file=sys.stderr, flush=True)

APP_ID = "zai-gitter"
EXECUTABLE = "zai-gitter"
MARKER = "# Added by zai installer"
CLI_PATHS = (
    ".copilot", ".copilot-console", ".pi", ".pi-console", ".codex", ".claude",
    ".opencode", "backups", "configs", "states", "runs", "logs",
    "releases", ".install-manifest.json", "settings.json", "agent-client.json",
    "rail-sizes.json", "service-history.json", ".service-history", "projects.json",
    ".projects", ".profile.lock", ".pi.lock", ".codex.lock", ".claude.lock",
    ".opencode.lock", ".copilot.plugin-sync.lock", "locks", "agent-identity",
    "zai-temp", "copilot-tmp",
)


class AppRunningError(ValueError):
    pass


class UninstallArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        zai_message("ERROR", message)
        zai_message("FAIL", f"{APP_ID} uninstallation did not start.")
        zai_message("NEXT", "Run this uninstaller with --help to see valid options.")
        raise SystemExit(2)


def linked(path: Path) -> bool:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    )


def check_path(path: Path, home: Path) -> Path:
    if not path.is_absolute():
        raise ValueError(f"Use an absolute path: {path}")
    path = Path(os.path.abspath(path))
    if path == home or path in home.parents or path == Path(path.anchor):
        raise ValueError(f"Refusing unsafe cleanup path: {path}")
    for parent in path.parents:
        if linked(parent):
            raise ValueError(f"Refusing linked parent: {parent}")
    return path


def read_object(path: Path) -> dict:
    if linked(path):
        raise ValueError(f"Refusing linked metadata: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def protect_repositories(path: Path) -> None:
    if linked(path) or not path.is_dir():
        return
    for root, dirs, files in os.walk(path, followlinks=False):
        if ".git" in dirs or ".git" in files:
            raise ValueError(f"Refusing repository cleanup path: {root}")
        dirs[:] = [name for name in dirs if not linked(Path(root) / name)]


@contextmanager
def install_guard(directory: Path, dry_run: bool):
    if dry_run or not directory.exists():
        yield
        return
    root = check_path(directory / "releases", Path.home().resolve())
    if linked(root) or linked(root / "install.lock"):
        raise ValueError(f"Refusing linked installer lock: {root}")
    root.mkdir(exist_ok=True)
    with (root / "install.lock").open("a+b") as handle:
        if os.fstat(handle.fileno()).st_size == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def remove(path: Path, dry_run: bool) -> None:
    if not path.exists() and not linked(path):
        return
    print(f"{'Would remove' if dry_run else 'Removing'} {path}")
    if dry_run:
        return
    if linked(path):
        if path.is_dir() and os.name == "nt" and not path.is_symlink():
            path.rmdir()  # Unlink a junction, never traverse its target.
        else:
            path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def write_object(path: Path, payload: dict, dry_run: bool) -> None:
    print(f"{'Would update' if dry_run else 'Updating'} {path}")
    if not dry_run:
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def active_apps(names: set[str]) -> set[str]:
    command = ["tasklist", "/FO", "CSV", "/NH"] if os.name == "nt" else ["ps", "-axo", "comm="]
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=15)
    if os.name == "nt":
        running = {row[0].lower() for row in csv.reader(result.stdout.splitlines()) if row}
    else:
        running = {Path(line.strip()).name for line in result.stdout.splitlines()}
    return running & names


def profile_lines(directory: Path) -> set[str]:
    target = str(directory)
    quoted = target.replace("'", "'\\''")
    return {
        f'export PATH="{target}:$PATH"  {MARKER}',
        f"export PATH='{quoted}':\"$PATH\"  {MARKER}",
    }


def clean_profiles(home: Path, directory: Path, dry_run: bool) -> None:
    owned = profile_lines(directory)
    for name in (".profile", ".bashrc", ".bash_profile", ".zshrc", ".zprofile"):
        path = home / name
        if not path.exists():
            continue
        if linked(path):
            raise ValueError(f"Refusing linked shell profile: {path}")
        with path.open(encoding="utf-8", newline="") as handle:
            existing = handle.read()
        updated = "".join(line for line in existing.splitlines(keepends=True)
                          if line.rstrip("\r\n") not in owned)
        if updated != existing:
            print(f"{'Would update' if dry_run else 'Updating'} {path}")
            if not dry_run:
                with path.open("w", encoding="utf-8", newline="") as handle:
                    handle.write(updated)


def filter_path(current: str, directory: Path, separator: str) -> str:
    target = os.path.normcase(os.path.normpath(str(directory)))
    return separator.join(entry for entry in current.split(separator)
                          if not entry or os.path.normcase(os.path.normpath(
                              os.path.expandvars(entry.strip().strip('"')))) != target)


def clean_windows_path(directory: Path, dry_run: bool) -> None:
    import winreg

    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0,
                             winreg.KEY_READ | winreg.KEY_WRITE)
    except FileNotFoundError:
        return
    with key:
        try:
            current, kind = winreg.QueryValueEx(key, "Path")
        except FileNotFoundError:
            return
        updated = filter_path(current, directory, ";")
        if updated != current:
            print(f"{'Would update' if dry_run else 'Updating'} Windows user PATH")
            if not dry_run:
                winreg.SetValueEx(key, "Path", 0, kind, updated)
    if not dry_run:
        import ctypes

        from ctypes import wintypes

        broadcast = ctypes.windll.user32.SendMessageTimeoutW
        broadcast.argtypes = (wintypes.HWND, wintypes.UINT, wintypes.WPARAM,
                              ctypes.c_wchar_p, wintypes.UINT, wintypes.UINT,
                              ctypes.POINTER(ctypes.c_size_t))
        broadcast.restype = wintypes.LPARAM
        notified = broadcast(
            0xFFFF, 0x1A, 0, "Environment", 0x0002, 5000,
            ctypes.byref(ctypes.c_size_t()),
        )
        if not notified:
            zai_message("WARN", "Windows environment notification timed out; open a new terminal.")


def config_home(home: Path) -> Path:
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", str(home / "AppData" / "Roaming")))
    if sys.platform == "darwin":
        return home / "Library" / "Application Support"
    return Path(os.environ.get("XDG_CONFIG_HOME", str(home / ".config")))


def shortcut_paths(directory: Path, removals: list[Path]) -> list[Path]:
    paths = []
    for name, command in (("ze", "zai-editor"), ("zg", "zai-gitter")):
        if not any(directory / (command + suffix) in removals for suffix in ("", ".exe")):
            continue  # A retained sibling keeps its shortcut.
        link = directory / name
        if link.is_symlink() and os.readlink(link) == command:
            paths.append(link)
        launcher = directory / (name + ".cmd")
        content = (f'@echo off\r\nrem zai shortcut: {name} -> {command}\r\n'
                   f'"%~dp0{command}.exe" %*\r\n').encode("ascii")
        if (not linked(launcher) and launcher.is_file() and launcher.stat().st_size == len(content)
                and launcher.read_bytes() == content):
            paths.append(launcher)
    return paths


def plan(home: Path, directory: Path) -> tuple[list[Path], list[tuple[Path, dict]]]:
    paths = [directory / (EXECUTABLE + suffix) for suffix in ("", ".exe")]
    paths.append(directory / "licenses" / APP_ID)
    paths.extend(shortcut_paths(directory, paths))
    if APP_ID == "zai-cli":
        paths.extend(directory / name for name in CLI_PATHS if name != "releases")
        releases = directory / "releases"
        if releases.exists():
            if linked(releases):
                raise ValueError(f"Refusing linked installer state: {releases}")
            paths.extend(path for path in releases.iterdir() if path.name != "install.lock")
        manifest = directory / ".install-manifest.json"
        if manifest.exists() or linked(manifest):
            files = read_object(manifest).get("files")
            if not isinstance(files, dict):
                raise ValueError(f"Invalid install manifest: {manifest}")
            for name in files:
                relative = Path(name)
                if relative.is_absolute() or ".." in relative.parts:
                    raise ValueError(f"Invalid install manifest path: {name}")
                if relative.parts and relative.parts[0] in ("scripts", "bin"):
                    paths.append(directory / relative)
        paths.extend(directory / (name + suffix)
                     for name in ("zai-hook", ".zai-editor", ".zai-gitter")
                     for suffix in ("", ".exe"))
    else:
        paths.append(home / ("." + APP_ID))
    if APP_ID == "zai-editor":
        if os.environ.get("ZAI_EDITOR_LSP_HOME"):
            lsp = check_path(Path(os.environ["ZAI_EDITOR_LSP_HOME"]), home)
            if lsp.exists():
                records = lsp / "installed"
                if linked(lsp) or linked(records):
                    raise ValueError(f"Refusing linked custom LSP records: {lsp}")
                installed = list(records.iterdir()) if records.is_dir() else []
                for record in installed:
                    data = read_object(record)
                    if (record.suffix != ".json" or not isinstance(data.get("id"), str)
                            or not re.fullmatch(r"[a-z0-9-]+", data["id"])
                            or record.stem != data["id"] or not isinstance(data.get("key"), str)
                            or not re.fullmatch(r"[A-Za-z0-9._-]+", data["key"])
                            or data["key"] in (".", "..")
                            or not isinstance(data.get("configs"), dict) or not data["configs"]):
                        raise ValueError(f"Invalid LSP installation record: {record}")
                    paths.extend((record, lsp / "servers" / data["id"] / data["key"]))
                # Preserve ambiguous caches in custom LSP roots.
                if installed:
                    paths.append(lsp / ".install.lock")
        preview = check_path(Path(os.environ.get("ZAI_EDITOR_PREVIEW_HOME", str(config_home(home) / APP_ID / "preview"))), home)
        paths.extend(preview / name for name in ("origin.json", "control.json", "control.lock",
                                                "start.lock", "startup-error.txt", "control.json.writing"))

    updates = []
    manifest = directory / ".executable-manifest.json"
    if manifest.exists() or linked(manifest):
        payload = read_object(manifest)
        files = payload.get("files")
        if payload.get("schema_version") != 1 or not isinstance(files, dict):
            raise ValueError(f"Invalid executable manifest: {manifest}")
        own_names = {path.name for path in paths if path.parent == directory}
        # Legacy checksums cannot distinguish a byte-identical standalone reinstall.
        remaining = {name: digest for name, digest in files.items() if name not in own_names}
        if remaining:
            if remaining != files:
                updates.append((manifest, {**payload, "files": remaining}))
        else:
            paths.append(manifest)

    theme = check_path(Path(os.environ.get("ZAI_THEME_CONFIG", str(home / ".zai" / "theme.json"))), home)
    if theme.exists() or linked(theme):
        payload = read_object(theme)
        apps = payload.get("apps", {})
        if not isinstance(apps, dict):
            raise ValueError(f"Invalid theme settings: {theme}")
        key = "zai" if APP_ID == "zai-cli" else APP_ID
        if key in apps:
            payload["apps"] = {name: value for name, value in apps.items() if name != key}
            updates.append((theme, payload))
    return paths, updates


def uninstall(directory: Path, dry_run: bool = False) -> None:
    home = Path.home().resolve()
    directory = check_path(directory, home)
    if linked(directory):
        raise ValueError(f"Refusing linked installation directory: {directory}")
    if (directory / ".git").exists():
        raise ValueError(f"Refusing repository installation directory: {directory}")
    recovery = directory / (".uninstall-" + APP_ID + ".json")
    payload = {"appId": APP_ID, "installDir": str(directory)}
    if recovery.exists() or linked(recovery):
        if read_object(recovery) != payload:
            raise ValueError(f"Invalid uninstall recovery marker: {recovery}")
    elif directory != home / ".zai" and directory.exists():
        markers = [directory / (EXECUTABLE + suffix) for suffix in ("", ".exe")]
        markers.extend(directory / name for name in (".install-manifest.json", ".executable-manifest.json"))
        if not any(path.is_file() and not linked(path) for path in markers):
            print(f"No app ownership in {directory}; no files removed.")
            return
    with install_guard(directory, dry_run):
        _uninstall(home, directory, dry_run, recovery, payload)


def _uninstall(home: Path, directory: Path, dry_run: bool, recovery: Path, payload: dict) -> None:
    paths, updates = plan(home, directory)
    if APP_ID == "zai-cli":
        for tool in ("zai-editor", "zai-gitter"):
            if all(not (directory / (tool + suffix)).exists()
                   or directory / (tool + suffix) in paths for suffix in ("", ".exe")):
                paths.append(directory / "licenses" / tool)
    paths = [check_path(path, home) for path in paths]
    updates = [(check_path(path, home), payload) for path, payload in updates]
    for path in paths:
        if path == directory or path in directory.parents or path == Path.cwd():
            raise ValueError(f"Refusing overlapping cleanup path: {path}")
        protect_repositories(path)
    names = {name + suffix for name in ("zai", "zai-editor", "zai-gitter", "zai-hook",
                                        ".zai-editor", ".zai-gitter") for suffix in ("", ".exe")}
    if not dry_run:
        running = active_apps(names)
        if running:
            raise AppRunningError("Close zai apps and stop services before uninstalling: " + ", ".join(sorted(running)))
    planned = set(paths)
    # Unknown files and sibling executables can also depend on this PATH entry.
    survivors = [path for path in (directory.iterdir() if directory.exists() else []) if path not in planned
                 and path.name not in ("licenses", "theme.json", ".executable-manifest.json")]
    keep_path = any(path.is_file() and (path.suffix.lower() in (".exe", ".cmd", ".bat")
                                     or os.access(path, os.X_OK)) for path in survivors)
    if not keep_path and os.name != "nt":
        # Preflight linked profiles before any deletion.
        for name in (".profile", ".bashrc", ".bash_profile", ".zshrc", ".zprofile"):
            if linked(home / name):
                raise ValueError(f"Refusing linked shell profile: {home / name}")
    if not dry_run and directory.exists():
        write_object(recovery, payload, False)
    for path, updated in updates:
        write_object(path, updated, dry_run)
    for path in sorted(set(paths), key=lambda item: len(item.parts), reverse=True):
        remove(path, dry_run)
    # Retire only app-modified, otherwise empty theme documents.
    for path, payload in updates:
        if (path.name != ".executable-manifest.json" and not keep_path
                and set(payload) <= {"version", "schemaVersion", "apps"}
                and not payload.get("apps")):
            remove(path, dry_run)
    if keep_path:
        print(f"Keeping PATH entry for other executables in {directory}")
    elif os.name == "nt":
        clean_windows_path(directory, dry_run)
    else:
        clean_profiles(home, directory, dry_run)
    if not dry_run:
        prune_roots = (directory, home / ("." + APP_ID),
                       config_home(home) / "zai-editor" / "preview")
        empty_parents = {parent for path in paths for parent in path.parents
                         if any(parent == root or root in parent.parents for root in prune_roots)}
        empty_parents.update((directory / "licenses", directory))
        for parent in sorted(empty_parents, key=lambda item: len(item.parts), reverse=True):
            if parent.exists() and not linked(parent) and parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
        for path in paths:
            if path.exists() or linked(path):
                raise OSError(f"Cleanup incomplete: {path}")
        remove(recovery, False)
    if directory.exists():
        for path in directory.iterdir():
            if path not in planned:
                print(f"Retained shared or unrelated path: {path}")
    zai_message("OK", "Dry run complete." if dry_run else f"Uninstalled {APP_ID}.")
    zai_message("NEXT", "Open a new terminal to refresh PATH." if not dry_run else "To remove the listed app data, rerun without --dry-run or ZAI_UNINSTALL_DRY_RUN=1.")
    print("Git worktrees, project files, independent coding-agent installations, and unrelated files are preserved.")


def main() -> int:
    parser = UninstallArgumentParser(description=__doc__)
    parser.add_argument("--install-dir", type=Path, default=Path(os.environ.get("ZAI_INSTALL_DIR", str(Path.home() / ".zai"))))
    parser.add_argument("--dry-run", action="store_true", default=os.environ.get("ZAI_UNINSTALL_DRY_RUN") == "1")
    args = parser.parse_args()
    try:
        uninstall(args.install_dir, args.dry_run)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        zai_message("ERROR", str(error))
        zai_message("FAIL", f"{APP_ID} uninstall failed.")
        if isinstance(error, AppRunningError):
            next_step = "Close the listed apps and stop their services, then rerun the uninstaller. For zai, attach with zai and choose Close completely."
        elif isinstance(error, PermissionError):
            next_step = "Check ownership and write permissions for the reported path, then rerun the uninstaller."
        elif isinstance(error, ValueError):
            next_step = "Check the reported path or metadata and your install-directory override. Use --dry-run to inspect the removal plan before retrying; do not bypass the safety check."
        else:
            next_step = "Resolve the reason above, then rerun the same uninstaller to finish cleanup. Any recovery marker is retained for retry."
        zai_message("NEXT", next_step)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
ZAI_UNINSTALL_PYTHON

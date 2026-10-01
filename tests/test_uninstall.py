"""Exercise actual uninstall entrypoints against disposable homes only."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


def load_app():
    local = Path(__file__).with_name("uninstall.py")
    if local.exists():
        paths = [local]
    else:
        paths = sorted((Path(__file__).parents[1] / "uninstall").glob("*.py"))
    for path in paths:
        spec = importlib.util.spec_from_file_location(path.stem.replace("-", "_"), path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield module


APPS = list(load_app())


class UninstallTests(unittest.TestCase):
    def test_entrypoints_embed_same_implementation(self):
        for app in APPS:
            python = Path(app.__file__).read_text().rstrip()
            for extension in ("sh", "ps1"):
                self.assertIn(python, Path(app.__file__).with_suffix("." + extension).read_text())

    def run_case(self, app, body):
        with tempfile.TemporaryDirectory(prefix="zai-uninstall-test-") as root:
            home = Path(root) / "home with spaces"
            home.mkdir()
            directory = home / ".zai"
            directory.mkdir()
            env = {"HOME": str(home), "USERPROFILE": str(home)}
            with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(
                app.Path, "home", return_value=home
            ), mock.patch.object(app, "active_apps", return_value=set()), contextlib.redirect_stdout(io.StringIO()):
                with mock.patch.object(app, "clean_windows_path"):
                    body(home, directory)

    def test_cleanup_and_repeat(self):
        for app in APPS:
            with self.subTest(app=app.APP_ID):
                def body(home, directory):
                    for suffix in ("", ".exe"):
                        (directory / (app.EXECUTABLE + suffix)).write_text("binary")
                    license_dir = directory / "licenses" / app.APP_ID
                    license_dir.mkdir(parents=True)
                    (license_dir / "LICENSE").write_text("license")
                    profile = home / ".profile"
                    original = "# unrelated\nexport PATH=/keep:$PATH\n"
                    profile.write_text(original + "\n".join(app.profile_lines(directory)) + "\n")
                    private = home / ("." + app.APP_ID)
                    if app.APP_ID != "zai-cli":
                        private.mkdir()
                        (private / "log").write_text("data")
                    else:
                        for name in app.CLI_PATHS:
                            if name == ".install-manifest.json":
                                (directory / name).write_text('{"files":{}}')
                                continue
                            (directory / name).mkdir()
                            (directory / name / "state").write_text("data")
                        for name in ("zai-hook", ".zai-editor", ".zai-gitter"):
                            (directory / name).write_text("binary")
                    app.uninstall(directory)
                    self.assertFalse((directory / app.EXECUTABLE).exists())
                    self.assertEqual(profile.read_text(), original if os.name != "nt"
                                     else original + "\n".join(app.profile_lines(directory)) + "\n")
                    app.uninstall(directory)
                self.run_case(app, body)

    def test_siblings_worktrees_and_coding_agents_survive(self):
        for app in APPS:
            with self.subTest(app=app.APP_ID):
                def body(home, directory):
                    (directory / app.EXECUTABLE).write_text("own")
                    sibling = directory / ("zai-gitter" if app.EXECUTABLE != "zai-gitter" else "zai-editor")
                    sibling.write_text("sibling")
                    sibling.chmod(0o755)
                    worktree = directory / "worktrees" / "repo" / "important.txt"
                    worktree.parent.mkdir(parents=True)
                    worktree.write_text("unsaved code")
                    (home / ".codex").mkdir()
                    (home / ".codex" / "auth.json").write_text("independent")
                    profile = home / ".zshrc"
                    line = next(iter(app.profile_lines(directory))) + "\n"
                    profile.write_text(line)
                    app.uninstall(directory)
                    self.assertEqual(sibling.read_text(), "sibling")
                    self.assertEqual(worktree.read_text(), "unsaved code")
                    self.assertEqual((home / ".codex" / "auth.json").read_text(), "independent")
                    self.assertEqual(profile.read_text(), line)
                self.run_case(app, body)

    def test_dry_run_and_running_apps(self):
        for app in APPS:
            def body(home, directory):
                binary = directory / app.EXECUTABLE
                binary.write_text("unchanged")
                app.uninstall(directory, True)
                self.assertEqual(binary.read_text(), "unchanged")
                with mock.patch.object(app, "active_apps", return_value={app.EXECUTABLE}):
                    with self.assertRaisesRegex(ValueError, "Close zai"):
                        app.uninstall(directory)
                self.assertEqual(binary.read_text(), "unchanged")
            self.run_case(app, body)

    def test_invalid_paths_and_linked_parents(self):
        for app in APPS:
            def body(home, directory):
                for bad in (home, home.parent, Path("relative")):
                    with self.assertRaises(ValueError):
                        app.uninstall(bad)
                if os.name == "nt":
                    return  # Native junction coverage is a separate platform check.
                (home / "alias").symlink_to(directory, target_is_directory=True)
                with self.assertRaisesRegex(ValueError, "linked"):
                    app.uninstall(home / "alias")
                with self.assertRaisesRegex(ValueError, "linked"):
                    app.uninstall(home / "alias" / "child")
            self.run_case(app, body)

    def test_symlink_target_survives(self):
        if os.name == "nt":
            self.skipTest("POSIX symlink fixture; Windows junctions require native validation")
        for app in APPS:
            def body(home, directory):
                outside = home / "outside.txt"
                outside.write_text("keep")
                (directory / app.EXECUTABLE).symlink_to(outside)
                app.uninstall(directory)
                self.assertEqual(outside.read_text(), "keep")
                self.assertFalse((directory / app.EXECUTABLE).is_symlink())
            self.run_case(app, body)

    def test_theme_and_executable_ownership(self):
        for app in APPS:
            def body(home, directory):
                own = "zai" if app.APP_ID == "zai-cli" else app.APP_ID
                theme = directory / "theme.json"
                theme.write_text(json.dumps({"version": 1, "apps": {own: {}, "another-app": {"theme": "keep"}}}))
                manifest = directory / ".executable-manifest.json"
                manifest.write_text(json.dumps({"schema_version": 1, "files": {app.EXECUTABLE: "a", "other": "b"}}))
                app.uninstall(directory)
                self.assertEqual(json.loads(theme.read_text())["apps"], {"another-app": {"theme": "keep"}})
                self.assertEqual(json.loads(manifest.read_text())["files"], {"other": "b"})
            self.run_case(app, body)

    def test_bad_metadata_prevents_deletion(self):
        for app in APPS:
            def body(home, directory):
                binary = directory / app.EXECUTABLE
                binary.write_text("keep")
                (directory / "theme.json").write_text("{")
                with self.assertRaises(ValueError):
                    app.uninstall(directory)
                self.assertTrue(binary.exists())
            self.run_case(app, body)

    def test_editor_custom_data(self):
        for app in APPS:
            if app.APP_ID != "zai-editor":
                continue
            def body(home, directory):
                lsp = home / "managed servers"
                (lsp / "installed").mkdir(parents=True)
                (lsp / "installed" / "go.json").write_text('{"id":"go","key":"v1","configs":{"go":{}}}')
                (lsp / "servers" / "go" / "v1").mkdir(parents=True)
                (lsp / "servers" / "go" / "v1" / "go").write_text("server")
                (lsp / "unrelated").write_text("keep")
                preview = home / "preview"
                preview.mkdir()
                preview_names = ("origin.json", "control.json", "start.lock", "startup-error.txt", "control.json.writing")
                for name in preview_names:
                    (preview / name).write_text("metadata")
                (preview / "unrelated").write_text("keep")
                with mock.patch.dict(os.environ, {"ZAI_EDITOR_LSP_HOME": str(lsp), "ZAI_EDITOR_PREVIEW_HOME": str(preview)}):
                    app.uninstall(directory)
                    app.uninstall(directory)
                self.assertFalse((lsp / "servers" / "go" / "v1").exists())
                for name in preview_names:
                    self.assertFalse((preview / name).exists())
                self.assertEqual((lsp / "unrelated").read_text(), "keep")
                self.assertEqual((preview / "unrelated").read_text(), "keep")
            self.run_case(app, body)

    def test_path_filter_preserves_other_entries(self):
        for app in APPS:
            directory = Path("/somewhere/.zai")
            self.assertEqual(app.filter_path("/keep::/somewhere/.zai:/somewhere/.zai-other", directory, ":"),
                             "/keep::/somewhere/.zai-other")

    def test_repository_in_custom_install_or_data_is_protected(self):
        for app in APPS:
            def body(home, directory):
                (directory / app.EXECUTABLE).write_text("keep")
                (directory / ".git").mkdir()
                with self.assertRaisesRegex(ValueError, "repository"):
                    app.uninstall(directory)
                (directory / ".git").rmdir()
                data = directory / "configs" if app.APP_ID == "zai-cli" else home / ("." + app.APP_ID)
                (data / "nested" / ".git").mkdir(parents=True)
                with self.assertRaisesRegex(ValueError, "repository"):
                    app.uninstall(directory)
                self.assertTrue((directory / app.EXECUTABLE).exists())
            self.run_case(app, body)

    def test_unrelated_theme_and_global_settings_are_preserved(self):
        for app in APPS:
            def body(home, directory):
                custom = home / "custom.json"
                custom.write_text('{"unrelated":42}')
                with mock.patch.dict(os.environ, {"ZAI_THEME_CONFIG": str(custom)}):
                    app.uninstall(directory)
                self.assertEqual(json.loads(custom.read_text()), {"unrelated": 42})
                theme = directory / "theme.json"
                directory.mkdir(exist_ok=True)
                key = "zai" if app.APP_ID == "zai-cli" else app.APP_ID
                theme.write_text(json.dumps({"version": 1, "apps": {key: {}}, "global": {"theme": "keep"}}))
                app.uninstall(directory)
                self.assertEqual(json.loads(theme.read_text())["global"], {"theme": "keep"})
            self.run_case(app, body)

    def test_empty_custom_lsp_records_are_not_ownership(self):
        for app in APPS:
            if app.APP_ID != "zai-editor":
                continue
            def body(home, directory):
                custom = home / "unrelated"
                (custom / "installed").mkdir(parents=True)
                (custom / "servers").mkdir()
                (custom / "servers" / "keep").write_text("keep")
                (custom / ".install.lock").write_text("unrelated lock")
                with mock.patch.dict(os.environ, {"ZAI_EDITOR_LSP_HOME": str(custom)}):
                    app.uninstall(directory)
                self.assertEqual((custom / "servers" / "keep").read_text(), "keep")
                self.assertEqual((custom / ".install.lock").read_text(), "unrelated lock")
            self.run_case(app, body)

    def test_delete_failure_returns_nonzero(self):
        for app in APPS:
            def body(home, directory):
                binary = directory / app.EXECUTABLE
                binary.write_text("locked")
                with mock.patch.object(app, "remove", side_effect=PermissionError(str(binary))), mock.patch(
                    "sys.argv", ["uninstall.py", "--install-dir", str(directory)]
                ), contextlib.redirect_stderr(io.StringIO()) as errors:
                    self.assertEqual(app.main(), 1)
                self.assertIn(str(binary), errors.getvalue())
                self.assertEqual(binary.read_text(), "locked")
            self.run_case(app, body)

    def test_cli_preserves_identical_standalone_reinstall(self):
        import hashlib

        for app in APPS:
            if app.APP_ID != "zai-cli":
                continue
            def body(home, directory):
                sibling = directory / "zai-editor"
                sibling.write_bytes(b"same released version")
                sibling.chmod(0o755)
                manifest = directory / ".executable-manifest.json"
                manifest.write_text(json.dumps({"schema_version": 1, "files": {
                    "zai-editor": hashlib.sha256(sibling.read_bytes()).hexdigest()
                }}))
                app.uninstall(directory)
                self.assertEqual(sibling.read_bytes(), b"same released version")
            self.run_case(app, body)

    def test_custom_install_failure_can_be_retried(self):
        for app in APPS:
            def body(home, directory):
                custom = home / "custom"
                custom.mkdir()
                (custom / app.EXECUTABLE).write_text("binary")
                (custom / "unrelated").write_text("keep")
                cleanup = "clean_windows_path" if os.name == "nt" else "clean_profiles"
                with mock.patch.object(app, cleanup, side_effect=PermissionError("PATH locked")):
                    with self.assertRaises(PermissionError):
                        app.uninstall(custom)
                self.assertTrue((custom / (".uninstall-" + app.APP_ID + ".json")).exists())
                app.uninstall(custom)
                app.uninstall(custom)
                self.assertEqual((custom / "unrelated").read_text(), "keep")
                self.assertFalse((custom / (".uninstall-" + app.APP_ID + ".json")).exists())
            self.run_case(app, body)

    def test_busy_installer_lock_prevents_mutation(self):
        for app in APPS:
            def body(home, directory):
                binary = directory / app.EXECUTABLE
                binary.write_text("keep")
                with app.install_guard(directory, False):
                    with self.assertRaises(OSError):
                        app.uninstall(directory)
                self.assertEqual(binary.read_text(), "keep")
            self.run_case(app, body)

    def test_windows_registry_preserves_value_kind_and_other_entries(self):
        import ctypes
        import types

        for app in APPS:
            with tempfile.TemporaryDirectory(prefix="zai-registry-test-") as root:
                directory = Path(root) / ".zai"
                current = "%USERPROFILE%\\custom;;" + str(directory) + ";unrelated"
                registry = types.SimpleNamespace(
                    HKEY_CURRENT_USER=1, KEY_READ=1, KEY_WRITE=2,
                    OpenKey=mock.Mock(return_value=contextlib.nullcontext("key")),
                    QueryValueEx=mock.Mock(return_value=(current, 2)), SetValueEx=mock.Mock(),
                )
                notification = mock.Mock(return_value=1)
                windll = types.SimpleNamespace(user32=types.SimpleNamespace(SendMessageTimeoutW=notification))
                with mock.patch.dict("sys.modules", {"winreg": registry}), mock.patch.object(
                    ctypes, "windll", windll, create=True
                ), contextlib.redirect_stdout(io.StringIO()):
                    app.clean_windows_path(directory, False)
                registry.SetValueEx.assert_called_once_with(registry.OpenKey.return_value, "Path", 0, 2, "%USERPROFILE%\\custom;;unrelated")
                self.assertEqual(notification.argtypes[-1], ctypes.POINTER(ctypes.c_size_t))

    def test_custom_lsp_path_failure_is_recoverable(self):
        for app in APPS:
            if app.APP_ID != "zai-editor":
                continue
            def body(home, directory):
                lsp = home / "custom-lsp"
                (lsp / "installed").mkdir(parents=True)
                (lsp / "installed" / "go.json").write_text('{"id":"go","key":"v1","configs":{"go":{}}}')
                server = lsp / "servers" / "go" / "v1"
                server.mkdir(parents=True)
                (server / "go").write_text("server")
                cleanup = "clean_windows_path" if os.name == "nt" else "clean_profiles"
                with mock.patch.dict(os.environ, {"ZAI_EDITOR_LSP_HOME": str(lsp)}):
                    with mock.patch.object(app, cleanup, side_effect=PermissionError("PATH locked")):
                        with self.assertRaises(PermissionError):
                            app.uninstall(directory)
                    app.uninstall(directory)
                    app.uninstall(directory)
                self.assertFalse(server.exists())
            self.run_case(app, body)


if __name__ == "__main__":
    unittest.main()

"""Release boundary and failure regression tests; no forge writes."""
import json
import base64
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import stat

import release_apps
import release_bplayer
from release_packages import inspect_archive, verify_file, digest, asset_name
from release_publish import reconcile_latest, release_by_tag, recover, publish
from release_runtime import Runtime, exclusive_lock
from release_sources import changed, clone, identity, provenance, remote_snapshot


class SourceTest(unittest.TestCase):
    def test_remote_default_branch_is_authoritative(self):
        class Fake:
            def api(self, endpoint):
                return {'default_branch': 'fork/custom'} if endpoint == 'repos/owner/app' else {'object': {'sha': 'a' * 40}}
        self.assertEqual(remote_snapshot(Fake(), 'owner/app'), {
            'repository': 'owner/app', 'branch': 'fork/custom', 'commit': 'a' * 40})

    def test_local_origin_mismatch_stops_before_clone(self):
        class Fake:
            def run(self, *args, **kwargs):
                return 'git@github.com:other/app.git'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'app').mkdir()
            with self.assertRaisesRegex(ValueError, 'identity mismatch'):
                clone(Fake(), {'repository': 'owner/app', 'branch': 'custom', 'commit': 'a' * 40}, root, root / 'output')

    def test_source_provenance_never_uses_website_tag_target(self):
        with self.assertRaisesRegex(ValueError, 'lacks a source'):
            provenance('Published preview packages.')
        record = {'commit': 'a' * 40, 'dependencies': {'producer': 'b' * 40}}
        self.assertEqual(provenance('<!-- app-release-provenance ' + json.dumps(record) + ' -->'), record)
        self.assertEqual(provenance('Source revision `' + 'a' * 40 + '`')['commit'], 'a' * 40)

    def test_dependency_only_update_is_detected(self):
        self.assertTrue(changed({'commit': 'a', 'dependencies': {'tool': 'new'}},
                                {'commit': 'a', 'dependencies': {'tool': 'old'}}))
        self.assertFalse(changed({'commit': 'a'}, {'commit': 'a'}))

    def test_origin_credentials_are_rejected(self):
        for url in ('https://token@github.com/owner/repo', 'https://example.com/owner/repo'):
            with self.assertRaises(ValueError):
                identity(url)
        self.assertEqual(identity('git@github.com:owner/repo.git'), 'owner/repo')


    def test_recovery_cannot_downgrade_a_newer_remote_manifest(self):
        def manifest(version):
            return {'release': {'version': version}}
        self.assertEqual(reconcile_latest(manifest('0.3.7'), manifest('0.3.6')), 'superseded')
        self.assertEqual(reconcile_latest(manifest('0.3.6'), manifest('0.3.6')), 'identical')
        with self.assertRaisesRegex(ValueError, 'never overwrite'):
            reconcile_latest({'release': {'version': '0.3.6', 'bytes': 1}}, manifest('0.3.6'))


class PackageTest(unittest.TestCase):
    def test_final_archive_rejects_maps_and_unsafe_members(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'asset.zip'
            for name in ('app.pdb', 'app.js.map', 'app.dSYM/symbols', '../escape', '/absolute', '.env',
                         'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map'):
                with self.subTest(name=name):
                    with zipfile.ZipFile(path, 'w') as archive:
                        archive.writestr(name, b'private')
                    with self.assertRaises(ValueError):
                        inspect_archive(path)

    def test_safe_framework_links_allowed_but_link_ancestor_writes_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'asset.zip'
            def link(archive, name, target):
                entry = zipfile.ZipInfo(name)
                entry.create_system = 3
                entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(entry, target)
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('App.framework/Versions/A/binary', b'binary')
                link(archive, 'App.framework/Versions/Current', 'A')
                link(archive, 'App.framework/binary', 'Versions/Current/binary')
            inspect_archive(path)
            with zipfile.ZipFile(path, 'w') as archive:
                link(archive, 'a', '.')
                link(archive, 'a/b', '../outside')
            with self.assertRaisesRegex(ValueError, 'symlink ancestor'):
                inspect_archive(path)
            with zipfile.ZipFile(path, 'w') as archive:
                link(archive, 'a', '.')
                link(archive, 'b', 'a/../outside')
            with self.assertRaisesRegex(ValueError, 'Escaping archive symlink'):
                inspect_archive(path)

    def test_download_name_cannot_escape_staging(self):
        for name in ('/etc/file', '../escape', 'folder/file', 'C:\\file', '..'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                asset_name({'file': name})

    def test_modified_final_bytes_fail_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'asset.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('binary', b'approved')
            asset = {'file': path.name, 'bytes': path.stat().st_size, 'sha256': digest(path)}
            verify_file(path, asset)
            path.write_bytes(b'different')
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                verify_file(path, asset)


class DraftRecoveryTest(unittest.TestCase):
    def test_create_saves_response_id_without_reading_stale_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            journal = {}
            snapshot = {'repository': 'owner/app', 'branch': 'custom', 'commit': 'a' * 40, 'dependencies': {}}
            data = {'appId': 'app', 'release': {'version': '1.0.0', 'assets': []}}
            class Fake:
                site_repository = 'owner/site'
                def pages(self, endpoint):
                    raise AssertionError('A stale collection must not determine the created identity')
                def run(self, args, **kwargs):
                    if args[0] == 'git':
                        return 'b' * 40
                    if args[:3] == ['gh', 'api', '--method']:
                        request = json.loads(Path(args[-1]).read_text())
                        assert request['tag_name'] == 'app-v1.0.0'
                        assert request['draft'] and request['prerelease']
                        assert provenance(request['body']) == snapshot
                        return json.dumps({'id': 10, 'tag_name': 'app-v1.0.0'})
                    assert json.loads((root / 'journal.json').read_text())['release_id'] == 10
                    return ''
            with patch('release_publish.validate_metadata'), patch('release_publish.finish'):
                publish(Fake(), snapshot, data, root, root, root / 'journal.json', journal)
            self.assertEqual(journal['release_id'], 10)

    def test_stored_id_reads_draft_directly_and_rejects_another_tag(self):
        class Fake:
            site_repository = 'owner/site'
            def pages(self, endpoint):
                raise AssertionError('Stored identity must not depend on a collection')
            def api(self, endpoint):
                assert endpoint == 'repos/owner/site/releases/10'
                return {'id': 10, 'tag_name': 'app-v1', 'draft': True}
        self.assertEqual(release_by_tag(Fake(), 'app-v1', 10)['id'], 10)
        with self.assertRaisesRegex(ValueError, 'different tag'):
            release_by_tag(Fake(), 'other-v1', 10)

    def test_release_collection_finds_unpublished_draft(self):
        class Fake:
            site_repository = 'owner/site'
            def pages(self, endpoint):
                return [{'tag_name': 'app-v1', 'draft': True, 'id': 10}]
        self.assertEqual(release_by_tag(Fake(), 'app-v1')['id'], 10)

    def test_missing_draft_assets_never_upload_different_rebuilt_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            expected = root / 'expected.zip'
            with zipfile.ZipFile(expected, 'w') as archive:
                archive.writestr('binary', b'approved')
            asset = {'file': 'asset.zip', 'bytes': expected.stat().st_size, 'sha256': digest(expected)}
            journal = {'app': 'zai-gitter', 'tag': 'zai-gitter-v0.3.6',
                'snapshot': {'commit': 'a' * 40, 'dependencies': {}},
                'manifest': {'appId': 'zai-gitter', 'release': {'assets': [asset]}}}
            class Fake:
                site_repository = 'owner/site'
                stage = ''
                def pages(self, endpoint):
                    return [{'tag_name': journal['tag'], 'id': 10, 'draft': True,
                             'body': 'Source `' + 'a' * 40 + '`', 'assets': []}]
                def run(self, args, **kwargs):
                    raise AssertionError('Different rebuilt bytes must never be uploaded')
            output = root / 'output'
            def rebuild():
                output.mkdir()
                (output / 'asset.zip').write_bytes(b'different')
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                recover(Fake(), root, root / 'journal.json', journal, output, rebuild)


class RuntimeTest(unittest.TestCase):
    def test_nonzero_exit_preserves_redacted_failure_log(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'FIXTURE_TOKEN': 'sensitive-fixture'}):
            runtime = Runtime(Path(directory) / 'run')
            with self.assertRaisesRegex(RuntimeError, 'exited 7'):
                runtime.run([sys.executable, '-B', '-c', 'print("sensitive-fixture");raise SystemExit(7)'])
            log = (runtime.directory / '0001.log').read_text()
            self.assertNotIn('sensitive-fixture', log)
            self.assertIn('[REDACTED]', log)

    def test_timeout_terminates_owned_child(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Runtime(Path(directory) / 'run')
            with self.assertRaises(subprocess.TimeoutExpired):
                runtime.run([sys.executable, '-B', '-c', 'import time;time.sleep(30)'], timeout=.1)

    def test_timeout_log_redacts_child_environment_override(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Runtime(Path(directory) / 'run')
            with self.assertRaises(subprocess.TimeoutExpired):
                runtime.run([sys.executable, '-B', '-c', 'import os,time;print(os.environ["NEW_TOKEN"],flush=True);time.sleep(30)'],
                            env={'NEW_TOKEN': 'override-sensitive'}, timeout=.1)
            self.assertNotIn('override-sensitive', (runtime.directory / '0001.log').read_text())

    def test_second_process_cannot_acquire_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / 'release.lock'
            with exclusive_lock(lock):
                child = subprocess.run([sys.executable, '-B', '-c',
                    'from release_runtime import exclusive_lock;import sys\nwith exclusive_lock(__import__("pathlib").Path(sys.argv[1])): pass', str(lock)],
                    cwd=Path(__file__).parent, capture_output=True)
                self.assertNotEqual(child.returncode, 0)

    def test_force_requires_explicit_targets(self):
        with self.assertRaises(SystemExit) as error:
            release_apps.main(['--force'])
        self.assertEqual(error.exception.code, 2)

    def test_children_receive_temporary_storage_outside_source_staging(self):
        paths = []

        def process(runtime, args, staging):
            source = staging / 'source'
            source.mkdir()
            child_temporary = Path(runtime.run([sys.executable, '-B', '-c',
                'import tempfile;print(tempfile.gettempdir())'], cwd=source).strip())
            self.assertTrue(child_temporary.is_dir())
            self.assertFalse(source.is_relative_to(child_temporary))
            self.assertFalse(child_temporary.is_relative_to(staging))
            self.assertEqual({runtime.environment[key] for key in ('TMPDIR', 'TMP', 'TEMP')},
                             {str(child_temporary)})
            paths.extend([staging, child_temporary])
            return []

        with tempfile.TemporaryDirectory() as directory, patch.object(release_apps, 'process', process):
            self.assertEqual(release_apps.main(['--state-dir', directory]), 0)
            self.assertTrue(all(not path.exists() for path in paths))




class BPlayerDispatchTest(unittest.TestCase):
    def test_owned_active_run_resumes_and_records_actual_dispatch_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            site = root / 'site'
            (site / 'releases/bplayer/latest').mkdir(parents=True)
            (site / 'releases/bplayer/latest/manifest.json').write_text(json.dumps({'release': {'assets': []}}))
            snapshot = {'repository': 'owner/BPlayer', 'branch': 'custom', 'commit': 'a' * 40}
            journal = {'snapshot': snapshot, 'dispatch_intent': True, 'request_id': 'unique', 'before_run_ids': []}
            class Fake:
                timeout = 30
                site_branch = 'site-default'
                def api(self, endpoint):
                    if '/contents/' in endpoint:
                        return {'content': base64.b64encode(b'release_artifacts.py check release_artifacts.py prepare-aab automation_request_id').decode()}
                    if endpoint.endswith('/runs?per_page=100'):
                        return {'workflow_runs': [{'id': 99, 'status': 'in_progress', 'event': 'workflow_dispatch',
                            'display_title': 'Release unique', 'head_sha': 'b' * 40}]}
                    return {'status': 'completed', 'conclusion': 'success'}
                def run(self, args, **kwargs):
                    assert 'POST' not in args, 'An owned run must never be redispatched'
                    return ''
            with patch.object(release_bplayer, 'release_for_manifest', return_value={'body': 'Source `' + 'b' * 40 + '`'}), patch.object(release_bplayer, 'verify_pages'):
                release_bplayer.run_bplayer(Fake(), snapshot, site, root / 'journal.json', journal, root / 'assets')
            self.assertEqual(journal['run_id'], 99)
            self.assertEqual(journal['snapshot']['commit'], 'b' * 40)
            self.assertTrue(journal['complete'])

if __name__ == '__main__':
    unittest.main()

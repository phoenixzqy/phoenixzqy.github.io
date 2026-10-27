import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import release_apps
from release_cli_workflow import TARGETS, verify_artifacts
from release_packages import digest
from release_workflow import workflow_run


class NativeCLITest(unittest.TestCase):
    def fixture(self, output, mutation=None):
        snapshot = {'repository': 'phoenixzqy/zai-cli', 'branch': 'main', 'commit': 'a' * 40,
                    'dependencies': {'phoenixzqy/zai-editor': 'b' * 40},
                    'site_repository': 'phoenixzqy/phoenixzqy.github.io'}
        journal = {'version': '0.1.1', 'request_id': 'c' * 32}
        record = {key: snapshot[key] for key in ('repository', 'branch', 'commit', 'dependencies')}
        record.update(journal)
        (output / 'provenance.json').write_text(json.dumps(record))
        assets = []
        for target, (platform, architecture, rust) in TARGETS.items():
            path = output / f'zai-cli-0.1.1-{"-".join(target)}.zip'
            suffix = '.exe' if platform == 'windows' else ''
            prefix = 'zai.app/Contents/MacOS/' if platform == 'macos' else ''
            files = {prefix + name + suffix: hashlib.sha256(b'desktop').hexdigest()
                     for name in ('zai-desktop', 'zai-desktop-runtime')}
            desktop = {'protocol': 1, 'target': rust,
                       'cli_sha256': hashlib.sha256(b'cli').hexdigest(), 'files': files}
            if mutation == 'binding':
                desktop['cli_sha256'] = '0' * 64
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('zai-release.json', json.dumps(dict(record, target=list(target))))
                for name in ('zai', 'zai-editor', 'zai-gitter'):
                    archive.writestr(name + suffix, b'cli')
                archive.writestr('install.py', b'installer')
                if mutation != 'gui':
                    archive.writestr('desktop/desktop-manifest.json', json.dumps(desktop))
                    for name in files:
                        archive.writestr('desktop/' + name, b'changed' if mutation == 'desktop' else b'desktop')
            assets.append({'file': path.name, 'platform': platform, 'architecture': architecture,
                           'bytes': path.stat().st_size, 'sha256': digest(path), 'signing': 'unsigned',
                           'url': 'https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/zai-cli-v0.1.1/' + path.name})
        return snapshot, journal, {'schemaVersion': 1, 'appId': 'zai-cli',
                                   'release': {'version': '0.1.1', 'assets': assets}}

    def test_artifacts_require_complete_native_gui_provenance_and_bytes(self):
        for mutation in (None, 'missing', 'gui', 'desktop', 'binding', 'dependencies', 'bytes'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                snapshot, journal, data = self.fixture(output, mutation)
                if mutation == 'missing':
                    data['release']['assets'].pop()
                elif mutation == 'dependencies':
                    snapshot['dependencies']['phoenixzqy/zai-editor'] = 'd' * 40
                elif mutation == 'bytes':
                    data['release']['assets'][0]['sha256'] = '0' * 64
                if mutation is None:
                    self.assertEqual(verify_artifacts(data, output, snapshot, journal), data)
                else:
                    with self.assertRaises((ValueError, KeyError)):
                        verify_artifacts(data, output, snapshot, journal)

    def test_unchanged_publish_stops_before_workflow_or_build_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot, _, _ = self.fixture(root)
            previous = {key: snapshot[key] for key in ('repository', 'branch', 'commit', 'dependencies')}
            args = SimpleNamespace(publish=True, owner='phoenixzqy', state_dir=root, force=False,
                                   workspace=root, apps=['zai-cli'])
            runtime = SimpleNamespace(site_repository=snapshot['site_repository'], environment={}, event=lambda text: None,
                                      run=lambda *a, **k: '{}')
            release = {'body': '<!-- app-release-provenance ' + json.dumps(previous) + ' -->'}
            with patch.object(release_apps, 'remote_snapshot', return_value=snapshot), \
                    patch.object(release_apps, 'discover', side_effect=lambda *a: [copy.deepcopy(snapshot)]), \
                    patch.object(release_apps, 'clone', return_value=root), \
                    patch.object(release_apps, 'release_for_manifest', return_value=release), \
                    patch.object(release_apps, 'configure_site') as setup, \
                    patch.object(release_apps, 'run_cli') as dispatch:
                # All three bundled dependency revisions must match.
                for producer in ('zai-editor', 'zai-gitter', 'zai-design-system'):
                    previous['dependencies']['phoenixzqy/' + producer] = snapshot['commit']
                release['body'] = '<!-- app-release-provenance ' + json.dumps(previous) + ' -->'
                reports = release_apps.process(runtime, args, root)
                self.assertEqual(reports[0]['status'], 'unchanged')
                setup.assert_not_called()
                dispatch.assert_not_called()
                previous['dependencies']['phoenixzqy/zai-editor'] = 'e' * 40
                release['body'] = '<!-- app-release-provenance ' + json.dumps(previous) + ' -->'
                tasks, _ = release_apps.detect_tasks(runtime, args, [copy.deepcopy(snapshot)], root, root)
                self.assertEqual(len(tasks), 1)

    def test_uncertain_dispatch_keeps_intent_and_recovers_without_redispatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = {'repository': 'phoenixzqy/zai-cli', 'branch': 'main', 'commit': 'a' * 40}
            journal, calls = {}, []
            run = {'id': 42, 'event': 'workflow_dispatch', 'head_sha': snapshot['commit'], 'head_branch': 'main',
                   'status': 'completed', 'conclusion': 'success', 'html_url': 'https://github.com/run/42'}
            class Runtime:
                timeout = 20
                site_repository = 'phoenixzqy/phoenixzqy.github.io'
                def api(self, endpoint):
                    return {'workflow_runs': [run] if calls else []} if '/workflows/' in endpoint else run
                def run(self, args):
                    calls.append(args)
                    raise RuntimeError('Lost dispatch response')
            with patch('release_workflow.history', return_value=[]), \
                    patch('release_workflow.allocate', return_value='0.1.1'):
                with self.assertRaisesRegex(RuntimeError, 'Lost dispatch'):
                    workflow_run(Runtime(), snapshot, root / 'journal.json', journal, root,
                                 app='zai-cli', workflow='release.yml', inputs={'dependencies': '{}'})
                self.assertTrue(json.loads((root / 'journal.json').read_text())['dispatch_intent'])
                run['display_title'] = 'zai-cli release ' + journal['request_id']
                workflow_run(Runtime(), snapshot, root / 'journal.json', journal, root,
                             app='zai-cli', workflow='release.yml')
                self.assertEqual(len(calls), 1)
                self.assertEqual(journal['run_id'], 42)
                run['head_sha'] = 'b' * 40
                with self.assertRaisesRegex(ValueError, 'different source'):
                    workflow_run(Runtime(), snapshot, root / 'journal.json', journal, root,
                                 app='zai-cli', workflow='release.yml')

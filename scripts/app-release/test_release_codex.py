"""Test source workflow identity, complete packages and interrupted dispatch safety."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from release_codex_workflow import TARGETS, verify_manifest, workflow_run


class CodexWorkflowTest(unittest.TestCase):
    def fixture(self):
        snapshot = {'repository': 'phoenixzqy/zai-codex', 'branch': 'zai-codex', 'commit': 'a' * 40}
        assets = []
        for target, (platform, architecture) in TARGETS.items():
            name = f'zai-codex-0.1.2-{target}.zip'
            assets.append({'file': name, 'platform': platform, 'architecture': architecture,
                           'bytes': 10, 'signing': 'unsigned',
                           'url': f'https://github.com/phoenixzqy/zai-codex/releases/download/zai-codex-v0.1.2/{name}'})
        data = {'schemaVersion': 1, 'appId': 'zai-codex', 'sourceCommit': snapshot['commit'],
                'release': {'version': '0.1.2', 'assets': assets}}
        release = {'tag_name': 'zai-codex-v0.1.2', 'draft': False,
                   'body': '<!-- app-release-provenance ' + json.dumps(snapshot) + ' -->',
                   'assets': [{'name': a['file'], 'size': a['bytes'], 'browser_download_url': a['url']} for a in assets]}
        return snapshot, data, release

    def test_manifest_requires_all_targets_and_exact_source_release_urls(self):
        snapshot, data, release = self.fixture()
        self.assertEqual(verify_manifest(data, snapshot, '0.1.2', release), data)
        for mutation in ('missing', 'duplicate', 'foreign', 'revision', 'draft'):
            altered, published = copy.deepcopy(data), copy.deepcopy(release)
            if mutation == 'missing': altered['release']['assets'].pop()
            if mutation == 'duplicate': altered['release']['assets'][-1] = altered['release']['assets'][0]
            if mutation == 'foreign': altered['release']['assets'][0]['url'] = 'https://example.com/package.zip'
            if mutation == 'revision': altered['sourceCommit'] = 'b' * 40
            if mutation == 'draft': published['draft'] = True
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                verify_manifest(altered, snapshot, '0.1.2', published)

    def test_saved_dispatch_intent_never_dispatches_twice(self):
        snapshot, _, _ = self.fixture()
        journal = {'dispatch_intent': True, 'before_run_ids': [], 'request_id': 'unique', 'version': '0.1.2'}
        run = {'id': 7, 'event': 'workflow_dispatch', 'display_title': 'zai-codex release unique',
               'head_sha': snapshot['commit'], 'head_branch': snapshot['branch'],
               'status': 'completed', 'conclusion': 'success', 'html_url': 'https://github.com/run/7'}
        class Fake:
            timeout = 120
            commands = []
            def api(self, endpoint):
                return {'workflow_runs': [run]} if '/workflows/' in endpoint else run
            def run(self, args, **kwargs):
                self.commands.append(args)
        with tempfile.TemporaryDirectory() as directory:
            runtime = Fake()
            workflow_run(runtime, snapshot, Path(directory) / 'journal.json', journal, Path(directory))
            self.assertEqual(journal['run_id'], 7)
            self.assertEqual(runtime.commands, [])
            run['conclusion'] = 'failure'
            with self.assertRaisesRegex(RuntimeError, 'concluded failure'):
                workflow_run(runtime, snapshot, Path(directory) / 'journal.json', journal, Path(directory))
            self.assertEqual(runtime.commands, [])


if __name__ == '__main__':
    unittest.main()

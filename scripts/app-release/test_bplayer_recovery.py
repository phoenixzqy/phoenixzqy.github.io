"""Terminal BPlayer workflow recovery preserves publication ownership."""
import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_bplayer


class TerminalWorkflowTest(unittest.TestCase):
    def runtime(self, conclusion, attempt=1):
        class Fake:
            timeout = 30
            site_branch = 'main'

            def __init__(self):
                self.commands = []

            def api(self, endpoint):
                if '/contents/' in endpoint:
                    return {'content': base64.b64encode(
                        b'release_artifacts.py check release_artifacts.py prepare-aab automation_request_id'
                    ).decode()}
                if endpoint != 'repos/owner/BPlayer/actions/runs/99':
                    raise AssertionError(f'Unexpected request: {endpoint}')
                return {'status': 'completed', 'conclusion': conclusion,
                        'run_attempt': attempt, 'html_url': 'https://github.com/owner/BPlayer/actions/runs/99'}

            def run(self, args, **kwargs):
                self.commands.append(args)
                if 'POST' in args:
                    raise AssertionError('An owned run must never be redispatched')
                return ''

        return Fake()

    def journal(self):
        return {'app': 'bplayer', 'complete': False, 'dispatch_intent': True,
                'run_id': 99, 'request_id': 'owned', 'before_run_ids': [],
                'snapshot': {'repository': 'owner/BPlayer', 'branch': 'main', 'commit': 'a' * 40}}

    def test_unsuccessful_result_is_persisted_before_reporting_recovery(self):
        for conclusion in ('failure', 'cancelled'):
            with self.subTest(conclusion=conclusion), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                journal_path = root / 'bplayer.json'
                journal = self.journal()
                runtime = self.runtime(conclusion)
                for _ in range(2):
                    with self.assertRaisesRegex(RuntimeError, 'Reconcile published assets') as error:
                        release_bplayer.run_bplayer(runtime, journal['snapshot'], root,
                                                   journal_path, journal, root / 'assets')
                    self.assertIn(str(journal_path), str(error.exception))
                    journal = json.loads(journal_path.read_text())
                    self.assertFalse(journal['complete'])
                    self.assertTrue(journal['dispatch_intent'])
                    self.assertEqual(journal['run_id'], 99)
                    self.assertEqual(journal['workflow_terminal']['run_attempt'], 1)
                    self.assertEqual(journal['workflow_terminal']['conclusion'], conclusion)
                    self.assertEqual(journal['workflow_terminal']['run_id'], 99)
                    self.assertEqual(journal['workflow_terminal']['url'],
                                     'https://github.com/owner/BPlayer/actions/runs/99')
                    self.assertRegex(journal['workflow_terminal']['observed_at'], r'\d{4}-\d{2}-\d{2}T')
                self.assertEqual(runtime.commands, [])

    def test_successful_rerun_replaces_terminal_failure_without_dispatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / 'releases/bplayer/latest/manifest.json'
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({'release': {'assets': []}}))
            journal = self.journal()
            journal['workflow_terminal'] = {'conclusion': 'failure', 'run_attempt': 1}
            runtime = self.runtime('success', attempt=2)
            with patch.object(release_bplayer, 'release_for_manifest',
                              return_value={'body': 'Source `' + 'a' * 40 + '`'}), \
                    patch.object(release_bplayer, 'verify_pages') as verify:
                release_bplayer.run_bplayer(runtime, journal['snapshot'], root,
                                           root / 'bplayer.json', journal, root / 'assets')
            saved = json.loads((root / 'bplayer.json').read_text())
            self.assertTrue(saved['complete'])
            self.assertEqual(saved['workflow_terminal']['conclusion'], 'success')
            self.assertEqual(saved['workflow_terminal']['run_attempt'], 2)
            self.assertEqual(saved['run_id'], 99)
            verify.assert_called_once()


if __name__ == '__main__':
    unittest.main()

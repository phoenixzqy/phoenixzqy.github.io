"""Keep the two release entry points disjoint and dry runs free of publication."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_apps
import release_codex
from release_runtime import Runtime
from release_sources import APPS


class ReleaseScopesTest(unittest.TestCase):
    def test_dry_runs_discover_only_their_own_sources(self):
        for entrypoint, expected in ((release_apps, release_apps.OTHER_APPS),
                                     (release_codex, ('zai-codex',))):
            with self.subTest(script=entrypoint.__name__), tempfile.TemporaryDirectory() as directory:
                requests = []

                def api(runtime, endpoint):
                    requests.append(endpoint)
                    if '/git/ref/' in endpoint:
                        return {'object': {'sha': 'a' * 40}}
                    return {'default_branch': 'zai-codex' if endpoint.endswith('/zai-codex') else 'main'}

                repositories = [{'name': name, 'owner': {'login': 'phoenixzqy'}} for name in APPS]
                with patch.object(Runtime, 'api', api), \
                        patch.object(Runtime, 'pages', return_value=repositories), \
                        patch.object(Runtime, 'run', side_effect=AssertionError('Dry run executed a build or write')), \
                        patch.object(release_apps, 'clone', return_value=Path(directory) / 'site'), \
                        patch.object(release_apps, 'release_for_manifest', return_value=None):
                    self.assertEqual(entrypoint.main(['--dry-run', '--state-dir', directory]), 0)
                summary, = (Path(directory) / 'runs').glob('*/summary.json')
                report = json.loads(summary.read_text())
                self.assertFalse(report['publish'])
                self.assertEqual([item['app'] for item in report['apps']], list(expected))
                self.assertTrue(all(item['status'] == 'update' for item in report['apps']))
                source_requests = [endpoint for endpoint in requests if '/git/ref/' in endpoint]
                for app in APPS:
                    found = any(f'/{app}/git/ref/' in endpoint for endpoint in source_requests)
                    self.assertEqual(found, app in expected)

    def test_cross_group_targets_are_rejected_before_work_starts(self):
        for entrypoint, target in ((release_apps, 'zai-codex'), (release_codex, 'zai-cli')):
            with self.subTest(script=entrypoint.__name__), patch.object(release_apps, 'process') as process:
                with self.assertRaises(SystemExit) as error:
                    entrypoint.main(['--publish', '--apps', target])
                self.assertEqual(error.exception.code, 2)
                process.assert_not_called()

    def test_dry_run_cannot_be_combined_with_publish(self):
        for entrypoint in (release_apps, release_codex):
            with self.subTest(script=entrypoint.__name__), self.assertRaises(SystemExit) as error:
                entrypoint.main(['--dry-run', '--publish'])
            self.assertEqual(error.exception.code, 2)

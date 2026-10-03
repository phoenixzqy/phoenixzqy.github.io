"""Catalog publication follows the final Codex manifest, without forge writes."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from release_publish import finish, update_codex_catalog


SITE = Path(__file__).resolve().parents[2]


def manifest(platform, architecture):
    return {'schemaVersion': 1, 'appId': 'zai-codex', 'release': {
        'version': '0.1.1', 'channel': 'preview', 'assets': [{
            'platform': platform, 'architecture': architecture,
            'signing': 'unsigned', 'file': 'codex.zip'}]}}


class CodexCatalogTest(unittest.TestCase):
    def test_native_target_replaces_previous_readiness_and_preserves_other_content(self):
        for platform, architecture, target in (
                ('macos', 'arm64', 'macOS arm64'),
                ('windows', 'x64', 'Windows x64'),
                ('linux', 'arm64', 'Linux arm64')):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as directory:
                site = Path(directory)
                (site / 'apps').mkdir()
                original = json.loads((SITE / 'apps/catalog.json').read_text())
                app = next(app for app in original['apps'] if app['id'] == 'zai-codex')
                app['description'][0] = {'en': 'Existing description', 'zh-CN': '已有描述'}
                before = copy.deepcopy(original)
                path = site / 'apps/catalog.json'
                path.write_text(json.dumps(original))
                update_codex_catalog(site, manifest(platform, architecture))
                result = json.loads(path.read_text())
                updated = next(app for app in result['apps'] if app['id'] == 'zai-codex')
                self.assertEqual(updated['stage'], target + ' preview')
                self.assertIn(target, updated['installation'][0])
                self.assertNotIn('Linux x64', updated['installation'][0])
                self.assertEqual(updated['installation'][1:], app['installation'][1:])
                for entry in updated['platforms']:
                    if entry['id'] == platform:
                        self.assertIn(architecture + ' (unsigned)', entry['status'])
                    else:
                        self.assertEqual(entry['status'], 'No package is published for this release.')
                for key in ('stage', 'platforms', 'installation'):
                    updated[key] = next(app for app in before['apps'] if app['id'] == 'zai-codex')[key]
                self.assertEqual(result, before)

    def test_finish_stages_readiness_with_new_or_already_published_manifest(self):
        data = manifest('macos', 'arm64')
        for current in ({'release': None}, data):
            with self.subTest(identical=current == data), tempfile.TemporaryDirectory() as directory:
                site = Path(directory)
                (site / 'apps').mkdir()
                catalog_path = site / 'apps/catalog.json'
                catalog_path.write_bytes((SITE / 'apps/catalog.json').read_bytes())
                path = site / 'releases/zai-codex/latest/manifest.json'
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps(current))
                output = site / 'staging'
                output.mkdir()

                class Fake:
                    site_repository = 'owner/site'
                    site_branch = 'main'
                    commands = []

                    def run(inner, args, **kwargs):
                        inner.commands.append(args)
                        if args[:2] == ['git', 'show']:
                            return json.dumps(current)
                        if args[:3] == ['npm', 'run', 'validate:apps']:
                            catalog = json.loads(catalog_path.read_text())
                            app = next(app for app in catalog['apps'] if app['id'] == 'zai-codex')
                            self.assertEqual(app['stage'], 'macOS arm64 preview')
                            self.assertEqual(json.loads(path.read_text()), data)
                        if args[:3] == ['git', 'diff', '--cached']:
                            return 'apps/catalog.json\nreleases/zai-codex/latest/manifest.json'
                        if args[:2] == ['git', 'rev-parse']:
                            return 'a' * 40
                        return ''

                    def pages(inner, endpoint):
                        return [{'tag_name': 'zai-codex-v0.1.1', 'draft': False}]

                runtime = Fake()
                journal = {'tag': 'zai-codex-v0.1.1'}
                with patch('release_publish.download') as download, patch('release_publish.verify_pages'):
                    finish(runtime, data, output, site, site / 'journal.json', journal)
                download.assert_called_once()
                staged = [str(arg) for args in runtime.commands if args[:2] == ['git', 'add']
                          for arg in args[2:]]
                self.assertIn('apps/catalog.json', staged)
                self.assertIn(str(path), staged)
                self.assertEqual(sum(args[:2] == ['git', 'commit'] for args in runtime.commands), 1)
                self.assertTrue(journal['complete'])


if __name__ == '__main__':
    unittest.main()

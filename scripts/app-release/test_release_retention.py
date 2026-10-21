"""Retention follows deployed manifests and never removes unfinished releases."""
import base64
import copy
import json
import unittest
from unittest.mock import patch

import release_retention


def release(tag, identity, *, draft=False):
    return {'id': identity, 'tag_name': tag, 'draft': draft, 'assets': []}


class FakeRuntime:
    site_repository = 'owner/phoenixzqy.github.io'
    site_branch = 'main'

    def __init__(self, app='zai-editor'):
        self.data = {'appId': app, 'release': {'version': '0.3.7', 'assets': [
            {'file': 'package.zip', 'bytes': 12, 'sha256': 'a' * 64,
             'url': f'https://github.com/{self.site_repository}/releases/download/{app}-v0.3.7/package.zip'}]}}
        self.current = release(f'{app}-v0.3.7', 7)
        self.current['assets'] = [{'name': 'package.zip', 'size': 12,
                                  'browser_download_url': self.data['release']['assets'][0]['url']}]
        self.listings = {self.site_repository: [release(f'{app}-v0.3.6', 6), self.current],
                         f'owner/{app}': [release(f'{app}-v0.3.5', 5)]}
        self.commands = []
        self.active = []
        self.tags = None

    def api(self, endpoint):
        if '/contents/' in endpoint:
            return {'content': base64.b64encode(json.dumps(self.data).encode()).decode()}
        if '/actions/runs?' in endpoint:
            return {'workflow_runs': self.active}
        if '/releases/tags/' in endpoint:
            return self.current
        if '/releases/' in endpoint:
            identity = int(endpoint.rsplit('/', 1)[1])
            return next(r for releases in self.listings.values() for r in releases if r['id'] == identity)
        raise AssertionError(endpoint)

    def pages(self, endpoint):
        if '/tags?' in endpoint:
            if self.tags is None:
                self.tags = {repository: [{'name': r['tag_name']} for r in releases]
                             for repository, releases in self.listings.items()}
            return self.tags[endpoint.split('/tags?')[0].removeprefix('repos/')]
        repository = endpoint.split('/releases?')[0].removeprefix('repos/')
        return list(self.listings[repository])

    def run(self, args, **kwargs):
        self.commands.append(args)
        if args[:3] == ['gh', 'release', 'delete']:
            repository = args[args.index('--repo') + 1]
            self.listings[repository] = [r for r in self.listings[repository] if r['tag_name'] != args[3]]
        if args[:4] == ['gh', 'api', '--method', 'DELETE']:
            repository, tag = args[4].removeprefix('repos/').split('/git/refs/tags/')
            self.tags[repository] = [r for r in self.tags[repository] if r['name'] != tag]
        return ''

    def event(self, message):
        pass


class RetentionTest(unittest.TestCase):
    def prune(self, runtime, **kwargs):
        return release_retention.prune_releases(runtime, copy.deepcopy(runtime.data), **kwargs)

    def test_removes_only_older_matching_published_releases_in_both_repositories(self):
        runtime = FakeRuntime()
        runtime.listings[runtime.site_repository] += [
            release('zai-editor-v0.3.8', 8), release('zai-editor-v0.3.4', 4, draft=True),
            release('zai-gitter-v0.3.1', 21), release('v0.3.1', 22), release('zai-editor-vinvalid', 23)]
        removed = self.prune(runtime)
        self.assertEqual([(r['repository'], r['tag']) for r in removed], [
            (runtime.site_repository, 'zai-editor-v0.3.6'), ('owner/zai-editor', 'zai-editor-v0.3.5')])
        self.assertEqual([command[:3] for command in runtime.commands], [
            ['gh', 'release', 'delete'], ['gh', 'release', 'delete'], ['gh', 'api', '--method'], ['gh', 'api', '--method']])
        self.assertEqual({r['name'] for r in runtime.tags[runtime.site_repository]}, {
            'zai-editor-v0.3.7', 'zai-editor-v0.3.8', 'zai-editor-v0.3.4',
            'zai-gitter-v0.3.1', 'v0.3.1', 'zai-editor-vinvalid'})

    def test_dry_run_never_deletes(self):
        runtime = FakeRuntime()
        self.assertEqual(len(self.prune(runtime, apply=False)), 2)
        self.assertEqual(runtime.commands, [])

    def test_removes_legacy_source_packages_but_preserves_module_tags_and_review_evidence(self):
        runtime = FakeRuntime()
        runtime.listings['owner/zai-editor'] = [release('v0.2.0', 20), release('pr-visual-evidence', 21)]
        removed = self.prune(runtime)
        self.assertEqual([r['tag'] for r in removed], ['zai-editor-v0.3.6', 'v0.2.0'])
        self.assertEqual(runtime.tags['owner/zai-editor'], [{'name': 'v0.2.0'}, {'name': 'pr-visual-evidence'}])

    def test_retry_finishes_tag_cleanup_after_release_deletion_succeeded(self):
        runtime = FakeRuntime()
        original = runtime.run
        def interrupted(args, **kwargs):
            if args[:4] == ['gh', 'api', '--method', 'DELETE']:
                raise RuntimeError('tag deletion interrupted')
            return original(args, **kwargs)
        with patch.object(runtime, 'run', side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, 'tag deletion interrupted'):
                self.prune(runtime)
        self.assertEqual(runtime.listings[runtime.site_repository], [runtime.current])
        self.assertEqual(runtime.listings['owner/zai-editor'], [])
        self.assertEqual(self.prune(runtime), [])
        self.assertEqual(runtime.tags[runtime.site_repository], [{'name': 'zai-editor-v0.3.7'}])
        self.assertEqual(runtime.tags['owner/zai-editor'], [])

    def test_manifest_change_aborts_before_deletion(self):
        runtime = FakeRuntime()
        intended = copy.deepcopy(runtime.data)
        runtime.data['release']['version'] = '0.3.8'
        with self.assertRaisesRegex(RuntimeError, 'manifest changed'):
            release_retention.prune_releases(runtime, intended)
        self.assertEqual(runtime.commands, [])

    def test_missing_or_draft_current_release_prevents_all_deletion(self):
        for mutation in ('draft', 'size', 'url'):
            runtime = FakeRuntime()
            if mutation == 'draft':
                runtime.current['draft'] = True
            elif mutation == 'size':
                runtime.current['assets'][0]['size'] = 1
            else:
                runtime.current['assets'][0]['browser_download_url'] = 'https://example.com/package.zip'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.prune(runtime)
            self.assertEqual(runtime.commands, [])

    def test_active_workflow_and_api_failure_prevent_all_deletion(self):
        runtime = FakeRuntime()
        runtime.active = [{'status': 'queued'}]
        with self.assertRaisesRegex(RuntimeError, 'active workflow'):
            self.prune(runtime)
        runtime.active = []
        with patch.object(runtime, 'pages', side_effect=RuntimeError('API unavailable')):
            with self.assertRaisesRegex(RuntimeError, 'API unavailable'):
                self.prune(runtime)
        self.assertEqual(runtime.commands, [])

    def test_codex_keeps_source_release_and_removes_obsolete_website_copies(self):
        runtime = FakeRuntime('zai-codex')
        runtime.data['release']['assets'][0]['url'] = (
            'https://github.com/owner/zai-codex/releases/download/zai-codex-v0.3.7/package.zip')
        runtime.current['assets'][0]['browser_download_url'] = runtime.data['release']['assets'][0]['url']
        runtime.listings[runtime.site_repository].remove(runtime.current)
        runtime.listings['owner/zai-codex'].append(runtime.current)
        self.assertEqual(len(self.prune(runtime)), 2)
        self.assertFalse(any('zai-codex-v0.3.7' in command for command in runtime.commands))

    def test_unapproved_app_or_asset_repository_is_rejected(self):
        for app, url in [('bplayer', None), ('zai-editor', 'https://github.com/other/repo/package.zip')]:
            runtime = FakeRuntime(app)
            if url:
                runtime.data['release']['assets'][0]['url'] = url
            with self.assertRaises(ValueError):
                self.prune(runtime)
            self.assertEqual(runtime.commands, [])

    def test_changed_manifest_or_redrafted_candidate_is_rechecked_before_delete(self):
        for change in ('manifest', 'draft'):
            runtime = FakeRuntime()
            original = runtime.api
            reads = 0
            def api(endpoint):
                nonlocal reads
                if '/contents/' in endpoint:
                    reads += 1
                    if change == 'manifest' and reads == 2:
                        runtime.data['release']['version'] = '0.3.8'
                if change == 'draft' and endpoint.endswith('/releases/6'):
                    runtime.listings[runtime.site_repository][0]['draft'] = True
                return original(endpoint)
            with self.subTest(change=change), patch.object(runtime, 'api', side_effect=api):
                with self.assertRaisesRegex(RuntimeError, 'changed'):
                    self.prune(runtime)
            self.assertEqual(runtime.commands, [])


if __name__ == '__main__':
    unittest.main()

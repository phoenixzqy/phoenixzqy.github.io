"""Actions cleanup preserves deployment, journal and unrelated-run recovery."""
import base64
import copy
import json
import unittest
from unittest.mock import patch

from release_artifact_retention import prune_native_artifacts, prune_pages_artifacts


def run(identity, *, native=False, **changes):
    result = {'id': identity, 'head_sha': str(identity) * 40, 'head_branch': 'main',
              'status': 'completed', 'conclusion': 'success', 'run_attempt': 1,
              'event': 'workflow_dispatch', 'display_title': 'zai-cli release request',
              'path': '.github/workflows/release.yml' if native else 'dynamic/pages/pages-build-deployment'}
    result.update(changes)
    return result


def artifact(identity, name, source):
    return {'id': identity, 'name': name, 'size_in_bytes': 12,
            'created_at': f'2026-10-{source["id"]:02d}T00:00:00Z',
            'workflow_run': {key: source[key] for key in ('id', 'head_sha', 'head_branch')}}


class Fake:
    site_repository = 'owner/phoenixzqy.github.io'
    site_branch = 'main'

    def __init__(self):
        self.runs = {identity: run(identity) for identity in (1, 2, 3)}
        self.runs[4] = run(4, native=True)
        self.build = {'status': 'built', 'commit': self.runs[2]['head_sha']}
        self.artifacts = {identity: artifact(identity, 'github-pages', self.runs[identity])
                          for identity in (1, 2, 3)}
        self.data = {'appId': 'zai-cli', 'release': {'version': '1.0.0', 'assets': []}}
        self.journal = {'app': 'zai-cli', 'manifest': self.data, 'website_commit': 'b' * 40,
                        'tag': 'zai-cli-v1.0.0', 'dispatch_intent': True,
                        'run_id': 4, 'request_id': 'request', 'workflow_terminal': {'run_attempt': 1},
                        'snapshot': {'repository': 'owner/zai-cli', 'branch': 'main',
                                     'commit': self.runs[4]['head_sha']}}
        self.deleted = []
        self.listings = []

    def api(self, endpoint):
        if '/contents/' in endpoint:
            return {'content': base64.b64encode(json.dumps(self.data).encode()).decode()}
        if endpoint.endswith('/pages/builds/latest'):
            return copy.deepcopy(self.build)
        if '/actions/runs/' in endpoint:
            return copy.deepcopy(self.runs[int(endpoint.rsplit('/', 1)[1])])
        if '/actions/artifacts/' in endpoint:
            return copy.deepcopy(self.artifacts[int(endpoint.rsplit('/', 1)[1])])
        raise AssertionError(endpoint)

    def run(self, args, **kwargs):
        if args[:4] == ['gh', 'api', '--method', 'DELETE']:
            identity = int(args[4].rsplit('/', 1)[1])
            del self.artifacts[identity]
            self.deleted.append(identity)
            return ''
        assert args[:4] == ['gh', 'api', '--paginate', '--slurp']
        endpoint = args[4]
        self.listings.append(endpoint)
        if '/artifacts?' in endpoint:
            items = list(self.artifacts.values())
            if '/runs/' in endpoint:
                identity = int(endpoint.split('/runs/')[1].split('/')[0])
                items = [item for item in items if item['workflow_run']['id'] == identity]
            key = 'artifacts'
        else:
            items = [source for source in self.runs.values() if source['head_sha'] == self.build['commit']]
            key = 'workflow_runs'
        return json.dumps([{key: items[:1]}, {key: items[1:]}])

    def event(self, message):
        pass


class ArtifactRetentionTest(unittest.TestCase):
    def pages(self, runtime, **kwargs):
        return prune_pages_artifacts(runtime, '2' * 40, **kwargs)

    def test_pages_paginates_and_preserves_latest_newer_active_other_branch_and_unrelated_artifacts(self):
        runtime = Fake()
        for identity, changes in [(5, {'status': 'in_progress'}), (6, {'head_branch': 'feature'}),
                                  (7, {'path': '.github/workflows/other.yml'})]:
            runtime.runs[identity] = run(identity, **changes)
            runtime.artifacts[identity] = artifact(identity, 'github-pages', runtime.runs[identity])
            runtime.artifacts[identity]['created_at'] = '2026-10-01T00:00:00Z'
            runtime.artifacts[identity]['workflow_run']['id'] = identity
        # Older IDs exercise the terminal/branch/workflow guards, not the age guard.
        runtime.runs[10] = runtime.runs.pop(2)
        runtime.runs[10]['id'] = 10
        runtime.artifacts[2]['workflow_run']['id'] = 10
        runtime.artifacts[8] = artifact(8, 'review-evidence', runtime.runs[1])
        self.assertEqual([item['id'] for item in self.pages(runtime)], [1])
        self.assertEqual(runtime.deleted, [1])
        self.assertEqual(set(runtime.artifacts), {2, 3, 5, 6, 7, 8})
        self.assertEqual(len(runtime.listings), 2)

    def test_dry_runs_do_not_delete_anything(self):
        runtime = Fake()
        self.assertEqual(len(self.pages(runtime, apply=False)), 1)
        runtime.artifacts[4] = artifact(4, 'native-release', runtime.runs[4])
        self.assertEqual(len(prune_native_artifacts(runtime, runtime.data, runtime.journal, apply=False)), 1)
        self.assertEqual(runtime.deleted, [])

    def test_missing_latest_artifact_or_unfinished_changed_deployment_prevents_cleanup(self):
        for change in ('missing', 'building', 'commit'):
            runtime = Fake()
            if change == 'missing':
                del runtime.artifacts[2]
            elif change == 'building':
                runtime.build['status'] = 'building'
            else:
                runtime.build['commit'] = 'a' * 40
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                self.pages(runtime)
            self.assertEqual(runtime.deleted, [])

    def test_pages_deployment_change_and_inventory_failure_abort_before_deletion(self):
        for change in ('deployment', 'inventory'):
            runtime = Fake()
            original = runtime.run
            def execute(args, **kwargs):
                if '/actions/artifacts?' in args[-1]:
                    if change == 'inventory':
                        raise RuntimeError('pagination failed')
                    runtime.build['commit'] = 'a' * 40
                return original(args, **kwargs)
            with self.subTest(change=change), patch.object(runtime, 'run', side_effect=execute):
                with self.assertRaises(RuntimeError):
                    self.pages(runtime)
            self.assertEqual(runtime.deleted, [])

    def test_native_deletes_only_known_artifacts_from_exact_verified_run(self):
        runtime = Fake()
        for identity, name in [(4, 'release-inputs'), (5, 'package-linux-amd64'),
                               (6, 'native-release'), (7, 'source-validation'), (8, 'review-evidence')]:
            runtime.artifacts[identity] = artifact(identity, name, runtime.runs[4])
        self.assertEqual([item['id'] for item in
                          prune_native_artifacts(runtime, runtime.data, runtime.journal)], [4, 5, 6, 7])
        self.assertEqual(set(runtime.artifacts), {1, 2, 3, 8})

    def test_failed_active_rerun_or_wrong_source_request_never_deletes_native_artifacts(self):
        for changes in ({'conclusion': 'failure'}, {'status': 'in_progress'}, {'run_attempt': 2},
                        {'head_sha': 'f' * 40}, {'display_title': 'zai-cli release other'}):
            runtime = Fake()
            runtime.runs[4].update(changes)
            runtime.artifacts[4] = artifact(4, 'native-release', runtime.runs[4])
            with self.subTest(changes=changes), self.assertRaisesRegex(RuntimeError, 'unfinished'):
                prune_native_artifacts(runtime, runtime.data, runtime.journal)
            self.assertEqual(runtime.deleted, [])

    def test_native_manifest_change_stops_cleanup(self):
        runtime = Fake()
        intended = copy.deepcopy(runtime.data)
        journal = copy.deepcopy(runtime.journal)
        runtime.data['release']['version'] = '1.0.1'
        with self.assertRaisesRegex(RuntimeError, 'manifest changed'):
            prune_native_artifacts(runtime, intended, journal)
        self.assertEqual(runtime.deleted, [])

    def test_interrupted_native_cleanup_retries_remaining_artifacts(self):
        runtime = Fake()
        for identity in (4, 5):
            runtime.artifacts[identity] = artifact(identity, 'native-release', runtime.runs[4])
        original = runtime.run
        def execute(args, **kwargs):
            if args[:4] == ['gh', 'api', '--method', 'DELETE'] and args[-1].endswith('/5'):
                raise RuntimeError('delete interrupted')
            return original(args, **kwargs)
        with patch.object(runtime, 'run', side_effect=execute), self.assertRaisesRegex(RuntimeError, 'interrupted'):
            prune_native_artifacts(runtime, runtime.data, runtime.journal)
        self.assertEqual(runtime.deleted, [4])
        self.assertEqual([item['id'] for item in
                          prune_native_artifacts(runtime, runtime.data, runtime.journal)], [5])
        self.assertEqual(runtime.deleted, [4, 5])


if __name__ == '__main__':
    unittest.main()

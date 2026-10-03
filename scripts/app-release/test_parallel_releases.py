"""Prove bounded overlap, cancellation and combined publication without forge writes."""
from concurrent.futures import CancelledError
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import release_jobs
import release_publish
from release_runtime import Runtime
from release_website import publish_website


class ParallelJobsTest(unittest.TestCase):
    def runtime(self, root):
        runtime = Runtime(root / 'logs')
        runtime.site_repository = 'owner/site'
        runtime.site_branch = 'custom'
        runtime.environment = {'GOPRIVATE': 'github.com/owner/*'}
        return runtime

    def test_two_jobs_overlap_with_isolated_logs_and_failure_does_not_hide_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = self.runtime(root)
            barrier = threading.Barrier(2)
            active, peak = 0, 0
            guard = threading.Lock()
            def prepare(child, args, task, *_):
                nonlocal active, peak
                with guard:
                    active += 1
                    peak = max(peak, active)
                if task['name'] != 'zai-cli':
                    barrier.wait(timeout=5)
                child.run([sys.executable, '-B', '-c', 'print("built")'])
                with guard:
                    active -= 1
                if task['name'] == 'zai-gitter':
                    raise RuntimeError('fixture build failed')
                return task['name']
            tasks = [{'name': name} for name in ('zai-editor', 'zai-gitter', 'zai-cli')]
            with patch.object(release_jobs, 'prepare', side_effect=prepare):
                results = release_jobs.parallel_prepare(runtime, SimpleNamespace(jobs=2), tasks, root, root)
            self.assertEqual(peak, 2)
            self.assertEqual(results['zai-cli']['data'], 'zai-cli')
            self.assertIn('fixture build failed', results['zai-gitter']['error'])
            self.assertEqual(runtime.environment, {'GOPRIVATE': 'github.com/owner/*'})
            for task in tasks:
                log = root / 'logs' / task['name'] / '0001.log'
                self.assertEqual(log.read_text().strip(), 'built')

    def test_cancellation_terminates_all_workers_before_returning(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = self.runtime(root)
            started = threading.Barrier(3)
            def prepare(child, *_):
                started.wait(timeout=5)
                child.run([sys.executable, '-B', '-c', 'import time;time.sleep(30)'])
            def cancel():
                started.wait(timeout=5)
                time.sleep(.3)
                runtime.cancel.set()
            trigger = threading.Thread(target=cancel)
            trigger.start()
            before = time.monotonic()
            with patch.object(release_jobs, 'prepare', side_effect=prepare), self.assertRaises(CancelledError):
                release_jobs.parallel_prepare(runtime, SimpleNamespace(jobs=2),
                                              [{'name': 'a'}, {'name': 'b'}], root, root)
            trigger.join()
            self.assertLess(time.monotonic() - before, 5)


class WebsiteBatchTest(unittest.TestCase):
    def test_two_apps_share_one_commit_and_push_and_complete_only_after_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            entries = []
            for name in ('zai-editor', 'zai-gitter'):
                path = root / f'releases/{name}/latest/manifest.json'
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps({'release': None}))
                entries.append({'data': {'appId': name, 'release': {'version': '0.3.7'}},
                                'journal': {'complete': False}, 'journal_path': root / f'{name}.json'})
            class Fake:
                site_branch = 'remote-default'
                def __init__(self):
                    self.commands = []
                def run(self, args, **kwargs):
                    self.commands.append(args)
                    if args[:3] == ['git', 'diff', '--cached']:
                        return 'manifests'
                    if args[:2] == ['git', 'rev-parse']:
                        return 'a' * 40
                    return ''
            runtime = Fake()
            def verify(*_):
                self.assertEqual(sum(command[:2] == ['git', 'push'] for command in runtime.commands), 1)
            with patch.object(release_publish, 'verify_pages', side_effect=verify) as verification:
                publish_website(runtime, root, entries)
            self.assertEqual(sum(command[:2] == ['git', 'commit'] for command in runtime.commands), 1)
            self.assertEqual(verification.call_count, 2)
            for entry in entries:
                journal = json.loads(entry['journal_path'].read_text())
                self.assertTrue(journal['complete'])
                self.assertEqual(journal['website_commit'], 'a' * 40)

    def test_failed_push_keeps_every_journal_resumable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'releases/zai-gitter/latest/manifest.json'
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({'release': None}))
            entry = {'data': {'appId': 'zai-gitter', 'release': {'version': '0.3.7'}},
                     'journal': {'complete': False}, 'journal_path': root / 'journal.json'}
            class Fake:
                site_branch = 'main'
                def run(self, args, **kwargs):
                    if args[:2] == ['git', 'push']:
                        raise RuntimeError('push failed')
                    return ''
            with self.assertRaisesRegex(RuntimeError, 'push failed'):
                publish_website(Fake(), root, [entry])
            self.assertFalse(entry['journal']['complete'])

    def test_superseded_app_is_excluded_from_combined_push(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'releases/zai-gitter/latest/manifest.json'
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({'release': {'version': '0.3.8'}}))
            entry = {'data': {'appId': 'zai-gitter', 'release': {'version': '0.3.7'}},
                     'journal': {'complete': False}, 'journal_path': root / 'journal.json'}
            class Fake:
                site_branch = 'main'
                def run(self, args, **kwargs):
                    assert args[:2] != ['git', 'push']
                    return ''
            publish_website(Fake(), root, [entry])
            self.assertTrue(entry['journal']['superseded'])
            self.assertEqual(json.loads(path.read_text())['release']['version'], '0.3.8')

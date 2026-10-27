"""Build isolated app packages with bounded parallelism and cooperative cancellation."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import subprocess
import zipfile

from release_builds import allocate, build, refresh_dependencies
from release_runtime import write_json
from release_sources import clone

GO_APPS = {'zai-cli', 'zai-editor', 'zai-gitter'}
FAILURES = (OSError, ValueError, RuntimeError, KeyError, zipfile.BadZipFile, subprocess.TimeoutExpired)


def history(runtime, repository):
    tags = [item['name'] for item in runtime.pages(f'repos/{repository}/tags?per_page=100')]
    tags += [item['tag_name'] for item in runtime.pages(f'repos/{repository}/releases?per_page=100')]
    return tags


def prepare(runtime, args, task, root, site):
    snapshot, name = task['snapshot'], task['name']
    source = clone(runtime, snapshot, args.workspace, root)
    refresh_dependencies(runtime, source, snapshot)
    if name in ('zai-editor', 'zai-gitter'):
        module = f'github.com/{args.owner}/zai-design-system'
        runtime.run(['go', 'get', f'{module}@{snapshot["dependencies"][f"{args.owner}/zai-design-system"]}'], cwd=source)
        runtime.run(['go', 'mod', 'tidy'], cwd=source)
    journal = task['journal']
    version = journal.get('version')
    if not task['pending']:
        versions = history(runtime, snapshot['repository']) + history(runtime, runtime.site_repository)
        version = allocate(runtime, source, name, versions)
        journal.update(version=version, tag=f'{name}-v{version}')
    data = build(runtime, source, snapshot, version, task['output'], site, args.codex_notices)
    if not task['pending']:
        journal['manifest'] = data
        write_json(task['journal_path'], journal)
        if journal['tag'] in history(runtime, runtime.site_repository):
            raise RuntimeError('Version/tag allocated concurrently; retry before publication')
    return data


def parallel_prepare(runtime, args, tasks, root, site):
    """Wait for all owned workers before their temporary directories can be removed."""
    pool = ThreadPoolExecutor(max_workers=args.jobs)
    futures = {}
    results = {}
    try:
        for task in tasks:
            child = runtime.fork(task['name'])
            # Go's own compiler/tests are parallel too. Cap each worker without
            # changing the operator's persisted environment/toolchain settings.
            budget = max(1, min(4, (os.cpu_count() or 1) // args.jobs))
            requested = child.environment.get('GOMAXPROCS', os.environ.get('GOMAXPROCS', ''))
            if requested.isdigit() and int(requested) > 0:
                budget = min(budget, int(requested))
            child.environment['GOMAXPROCS'] = str(budget)
            flags = child.environment.get('GOFLAGS', os.environ.get('GOFLAGS', ''))
            child.environment['GOFLAGS'] = f'{flags} -p={budget}'.strip()
            futures[pool.submit(prepare, child, args, task, root, site)] = (task, child)
        for future in as_completed(futures):
            task, child = futures[future]
            try:
                results[task['name']] = {'data': future.result()}
            except FAILURES as error:
                child.event(f'FAILED: {error}')
                results[task['name']] = {'error': str(error), 'stage': child.stage}
    except BaseException:
        runtime.cancel.set()
        raise
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
    return results

"""Reconcile a journaled manual workflow dispatch without duplicate builds."""
import time
import uuid

from release_builds import allocate
from release_jobs import history
from release_runtime import write_json


def workflow_run(runtime, snapshot, journal_path, journal, source, *, app, workflow, inputs=None):
    endpoint = f'repos/{snapshot["repository"]}/actions/workflows/{workflow}'
    if not journal.get('run_id'):
        runs = runtime.api(f'{endpoint}/runs?per_page=100')['workflow_runs']
        if not journal.get('dispatch_intent'):
            if any(run['status'] != 'completed' for run in runs):
                raise RuntimeError(f'A {app} release is already active; retry after it finishes')
            versions = history(runtime, snapshot['repository']) + history(runtime, runtime.site_repository)
            version = allocate(runtime, source, app, versions)
            journal.update(version=version, tag=f'{app}-v{version}', dispatch_intent=True,
                           before_run_ids=[run['id'] for run in runs], request_id=uuid.uuid4().hex)
            write_json(journal_path, journal)
            fields = {'version': version, 'source_commit': snapshot['commit'],
                      'automation_request_id': journal['request_id'], **(inputs or {})}
            runtime.run(['gh', 'api', '--method', 'POST', f'{endpoint}/dispatches',
                         '-f', f'ref={snapshot["branch"]}',
                         *[argument for key, value in fields.items()
                           for argument in ('-f', f'inputs[{key}]={value}')]])
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            runs = runtime.api(f'{endpoint}/runs?per_page=100')['workflow_runs']
            candidates = [run for run in runs if run['id'] not in journal['before_run_ids']
                          and run['event'] == 'workflow_dispatch'
                          and run['display_title'] == f'{app} release {journal["request_id"]}']
            if len(candidates) > 1:
                raise RuntimeError(f'Ambiguous {app} dispatch; inspect runs without dispatching again')
            if candidates:
                run = candidates[0]
                if run['head_sha'] != snapshot['commit'] or run['head_branch'] != snapshot['branch']:
                    raise ValueError(f'{app} dispatch resolved a different source revision')
                journal['run_id'] = run['id']
                write_json(journal_path, journal)
                break
            time.sleep(5)
        else:
            raise RuntimeError(f'{app} dispatch not identified; intent retained to prevent duplicate releases')
    deadline = time.monotonic() + runtime.timeout
    while time.monotonic() < deadline:
        run = runtime.api(f'repos/{snapshot["repository"]}/actions/runs/{journal["run_id"]}')
        if run['head_sha'] != snapshot['commit'] or run['head_branch'] != snapshot['branch']:
            raise ValueError(f'Stored {app} workflow run has different source provenance')
        if run['status'] == 'completed':
            journal['workflow_terminal'] = {key: run.get(key) for key in ('id', 'run_attempt', 'conclusion', 'html_url')}
            write_json(journal_path, journal)
            if run['conclusion'] != 'success':
                raise RuntimeError(f'{app} release {run["html_url"]} concluded {run["conclusion"]}; '
                                   'inspect the run and any draft before resuming; no redispatch was attempted')
            return
        time.sleep(15)
    raise RuntimeError(f'{app} workflow timed out; remote run remains active and journal retained')

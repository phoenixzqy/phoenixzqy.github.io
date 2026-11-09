# Services, pollers, and labels

Documentation index · [Configuration reference](?id=zai-cli&doc=docs--config)

Use services for the delivery loop from a forge work item to a merged PR. Each delivery service has a deterministic selector and runs a coding agent on one selected item. Housekeep runs local maintenance on an interval. For the complete guide matching your installed version, run `zai doc` and the relevant command's `-h`.

## Choose the workflow before starting

The console's start-services popup shows these combinations:

| Workflow | dev scope | review scope | pr-babysitter scope |
| --- | --- | --- | --- |
| Solo: develop, self-review, merge | `all` | `all` | `all` |
| Team: work on demand (defaults) | `assigned` | `assigned` | `authored` |
| Review only | Do not start | `assigned` | Do not start |
| Maintain my PRs | Do not start | Do not start | `authored` |

Set scopes in Project config under each service's Poller, or edit `services.<service>.poller.scope` in the active file returned by `zai config path`. Save and verify with `zai config show`. The popup's checkboxes select services; they do not change scopes. `all` still requires workflow labels and fixed eligibility gates. Prefer assigned/authored for large ADO repositories; all must list their active PRs before filtering. For solo self-review in a shared repository, review scope `authored` is a narrower alternative.

| Service | Outcome |
| --- | --- |
| `dev` | Implements one ready issue/work item and opens a linked PR. An Investigation item instead receives a report and closes without a PR. |
| `review` | Reviews an eligible PR revision and publishes findings and the configured vote. A new head normally permits a fresh review. |
| `pr-babysitter` | Handles feedback, conflicts, failing/expired checks, and merge-ready PRs; merges or enables native auto-complete when requirements are satisfied. |
| `housekeep` | Synchronizes maintained branches and runs separately enabled cleanup tasks. It has no forge-item poller. |

## Configure and operate a repository

Run commands from the target checkout, whose remote must match the repository you intend to automate:

```text
zai config show
zai config path
zai config update
zai start dev,review,pr-babysitter
zai status
zai stop
zai restart
```

Missing default config is created automatically; existing values and active profiles are preserved. Repair malformed files or missing selected profiles before proceeding. `config show` is an effective-settings report, not a file to write back. Named profiles are complete copies; stop the daemon before switching profiles. Restart after changing service selection, provider, or model.

One daemon belongs to one repository and survives closing the console or launching terminal. Other repositories' daemons are independent. `zai start all` also starts housekeep; a selection including housekeep requires at least one enabled task. Use `--create-labels` for a non-interactive GitHub start when provisioning is needed. Startup checks forge account/repository access, agent availability, and required labels before launching. ADO tags need no pre-creation.

General settings include `coding_agent`, `working_directory`, `poll_interval_seconds` (default 60), `max_total_agents` (default 10), and notifications. Each delivery service also has an agent limit, timeout, and model. The total and per-service slot limits both constrain dispatch. An unavailable pinned model stops that service; repair it and restart. See fields, profiles, and [samples](?id=zai-cli&doc=docs--config--samples).

## Connect GitHub or Azure DevOps

Forge login and coding-agent login are separate. Verify the account and repository before changing poller scopes:

```text
gh auth status
gh repo view OWNER/REPO

az extension add --name azure-devops
az login
az repos show --org https://dev.azure.com/ORG --project PROJECT --repository REPO
```

For ADO dev, set `services.dev.query_id` to a saved query that returns the intended ready work items. It owns area/state selection; scope, workflow tags, and dependencies still apply. Set `services.dev.work_item_project` when work items live outside `repo.project`. Query hits from other projects are skipped. PR operations always use the configured code repository project.

ADO assigned review is direct-user-only unless `services.review.ado_reviewer_groups` contains verified groups. Names or GUIDs must resolve uniquely against the signed-in user's memberships. The dev query never selects review PRs. GitHub team requests also require verified membership. Review's group cap defaults to three distinct zai reviewers at a head; direct individual requests bypass that cap.

## How selection works

These are simplified selection rules, not additional configuration fields. Each delivery round resolves the active config and signed-in account, lists and hydrates candidates, applies fixed gates, then selects the smallest numeric eligible ID. Failed discovery returns an error rather than a partial selection. An empty selection can be normal.

### Dev

```text
GitHub: list open issues with marker + ready + every custom required label
ADO: run saved query in effective work-item project; require marker + ready tags
keep only the configured assigned/authored/all scope
exclude started, blocked, done, failed
read GitHub blocked-by dependencies or ADO Predecessor links
keep only items whose dependencies are complete; choose smallest numeric ID
claim by replacing ready with started; invoke Code or Investigation agent
```

ADO dev does not require custom tags; downstream PR pollers do. ADO predecessor terminal states include Closed, Done, Resolved, Removed, Completed, and Cancelled. Dependency-blocked candidates remain visible in poller JSON with open blockers, but cannot be selected. Declare ordering with native links; a prose checklist does not create a dependency gate.

### Review

```text
list open PRs in scope with marker + all custom required labels/tags
assigned excludes self-authored PRs; verified team/group requests may qualify
exclude blocked and any PR service claim
require known conflict-free mergeability; apply group-reviewer cap
normally skip drafts and already-reviewed heads; optionally gate failing checks
need-review overrides draft/check/head de-dup, not the fixed gates above
GitHub: a same-head own change request needs a new review request
choose smallest numeric ID; recheck claims; claim reviewing before invocation
```

`include_drafts` and `require_checks_passing` default off. Missing check rollups count as not configured for the review gate; merge requirements remain separate. ADO's existing reviewer vote is only a de-dup fallback when the head SHA is unavailable. GitHub self-review uses a verified approved-label receipt matching the head, because native self-approval is forbidden. A bare label, changed head, newer non-approving review, or need-review does not authorize merge. Independent approvals and branch rules still apply.

### PR babysitter

```text
list open PRs in scope with marker + all custom required labels/tags
exclude drafts unless included and PR service claims
exclude blocked unless need-babysit is present
need-babysit permits blocked and forces actionability/cooldown/attempt eligibility
otherwise:
  expired ADO required build -> actionable
  genuinely running required checks -> wait
  failure, conflict, unresolved/unanswered feedback, new review,
  or approved and merge-ready -> actionable
  no action or no stable head -> skip
same head AND actionable-state fingerprint:
  3 attempts -> post blocker explanation and mark blocked
  within 10 minutes of last attempt -> wait
  otherwise -> eligible; changed head/state starts a fresh count
choose smallest numeric non-skip decision (block or dispatch)
for dispatch: read linked items; claim fixing
```

A linked-item read failure makes no claim. Existing native auto-complete is not another merge task. The actionable fingerprint includes review activity and check/conflict/merge state, so new feedback at the same head can restart the count. The blocked comment identifies why progress stopped. Resolve the cause before removing blocked or requesting another pass.

### Housekeep

Housekeep releases dead managed claims and safely compacts unused managed worktrees separately from optional agent tasks. Its default cadence is three hours. Branch synchronization is on by default; stale unmanaged worktree, stale branch, and log cleanup are opt-in. Log cleanup runs first; a log-only pass needs no coding agent. Synchronization uses captured remote targets, preserves checkout changes and local-only commits, and verifies final refs. Preserve recovery branches/stashes when restoration fails. All tasks off prevents explicit start/run of housekeep; an existing daemon skips its agent passes.

Started daemon and one-off passes persist `maintenance.json` under `runs/housekeep/<repo-slug>/run-housekeep-.../`. Service Monitor discovers these records alongside item runs, including log-only passes, setup/verification failures, timeouts, and cancellations. A held `pass.lock` lease establishes active execution; an unfinished record with no live lease is stale. Disabled, overlapping, and capacity-skipped passes create no history. Records start with this version; earlier passes are not reconstructed. Maintenance records remain separate from the selected-item request/checkpoint/result schemas. New passes retain stdout/stderr in `logs/agent-output.log` and bounded lifecycle/progress records in `logs/service.ndjson`, visible in both Service Monitors. Log-only passes show deterministic progress without a coding agent. Earlier status-only passes cannot reconstruct their detached transcripts.

## Labels, retry, and safe inspection

Run `zai config show` for the effective `label_catalog`, `new_work_item_labels`, and `new_investigation_work_item_labels`. Names below illustrate the default prefix only:

- New work needs `zai` and `zai-ready`; `zai-investigation` selects a report instead of Code delivery.
- Started, blocked, done, and failed exclude dev work. Reviewing and fixing keep PR services from acting on the same item concurrently.
- `zai-need-review` requests a review beyond normal head de-dup; it does not bypass scope, claims, blocked, mergeability, group caps, or a retained same-head GitHub change request.
- `zai-need-babysit` requests another babysitter pass beyond its actionability/no-progress guard; scope, required labels, open/draft, and claim gates still apply; it can include a blocked PR.

For **read-only** diagnosis, use the underlying `gh`/`az` query templates in `zai doc`. `zai poller:item`, `zai poller:pr`, and `zai poller:pr-babysitter` run a real selection round and print JSON without launching an agent: they can change forge claims, consume overrides, or mark a stuck PR blocked. They are not dry runs. Never clear a claim unless you have verified its owner is no longer running.

A deliberate one-off invocation uses `zai agent:run <service> --url <item-url>`; it bypasses listing, reads the configured identity/model/agent, hydrates that item, and uses the normal claim/run lifecycle. Housekeep instead takes no URL. Check `zai agent:run -h` first.

## Diagnose from local evidence

In the console, Service Monitor shows polling, idle, running, or off state, active items, recent outcomes, and run detail. The GUI provides Overview, Pollers and Agent runs tabs with resolved poll targets, coding-agent/worker identity, context and results. Its live log follows by default; Pause or scrolling up preserves the reading position with an unread count, and Follow/Bottom resumes. Refresh reloads the snapshot and open log; Reload log retries details. Live reads retry transient failures and briefly drain final output after completion, then stop. Hidden or stale details do not poll. Activity age is the last snapshot update, not a periodic heartbeat. See the GUI housekeeping log, paused log, and poller details. Start diagnosis at the first failing stage:

1. Confirm setup: current checkout, active profile, forge and provider logins, started services.
2. Confirm discovery: scope, labels, dependencies, query/group assignments, draft, and mergeability.
3. Confirm dispatch: slot budget, model/agent resolution, command construction, timeout, and claims.
4. Confirm execution: terminal result, service stages, failing commands, and transcript.
5. Confirm handoff: current versus reviewed head, latest feedback, blocked reason, and actual merge requirements.

Local evidence normally lives under `~/.zai`:

| Path | Use |
| --- | --- |
| `logs/daemons/<repo-slug>.log` | Poll cycles, dispatch, daemon errors. |
| `states/<repo-slug>/` | Daemon state and poller heartbeat. |
| `runs/<service>/<repo-slug>/run-*/result.json` | Terminal run outcome. |
| `runs/housekeep/<repo-slug>/run-*/maintenance.json` | Housekeep pass state and bounded, redacted failure details. |
| The same run's `context-summary.json` | Last resumable checkpoint. |
| The same run's `logs/service.ndjson` | Lifecycle stages and classified failure. |
| The same run's `logs/agent-output.log` | Raw child transcript. |
| The same run's `logs/commands.ndjson` | Captured command start/completion evidence. |

A clean child exit alone is not service completion evidence. Logs remain local; forge comments and other intended forge actions are external. Redact secrets and private transcript content when sharing diagnostics. Automation history is separate: inspect it through Automations rather than searching service runs.

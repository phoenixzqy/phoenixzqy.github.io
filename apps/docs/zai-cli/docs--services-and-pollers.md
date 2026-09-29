# Services, pollers, and labels

Documentation index

A short tour of service mode: the four services, how delivery pollers pick work,
where run data lives, and how labels drive the lifecycle. The authoritative
design is the architecture specification, especially
The services. Every configuration field is in the
[configuration reference](?id=zai-cli&doc=docs--config).

## The services

Each delivery service pairs a deterministic, program-based poller with a
prompt-driven coding-agent action. The poller is ordinary program code, not an
LLM. It selects one actionable item from the forge. The service then runs the
matching agent on that one item, records local run state, and loops. Housekeep
instead runs interval-driven local maintenance without selecting a forge item.

| Service | Agent | What it does |
| --- | --- | --- |
| dev | `dev-service-agent`, `investigation-dev-agent` | Selects a GitHub issue or ADO work item. Code items are implemented and delivered as a linked pull request. Investigation items get a posted report and are closed without a pull request. |
| review | `review-service-agent` | Selects a pull request assigned or requested for review and posts a structured review. A pull request is normally reviewed again after a new commit, or when a force-review is requested (`zai-need-review`). |
| pr-babysitter | `pr-babysitter-service-agent` | Selects one of your own pull requests that needs action: failed or expired checks, merge conflicts, unresolved review threads, or approved and ready to merge. It fixes the blocker, then merges (or enables auto-complete) and closes linked items. |
| housekeep | `housekeep-service-agent` | Runs configured local maintenance on an interval: maintained-branch sync, stale worktree and branch cleanup, and log cleanup. |

Every service supports both GitHub and Azure DevOps.

`zai start all` starts one background daemon per repository, so several
repositories can run at once. `zai start <service>` or a comma-separated subset
runs a narrower loop. `zai status`, `zai stop`, and `zai restart` act only on
the current repository's daemon.

## Pollers

Each delivery poller detects the repository and forge from its working directory, reads
the repository config, lists open items carrying the workflow marker label
within its configured **scope**, and selects one item deterministically. The
defaults are `assigned` for dev and review and `authored` for pr-babysitter.
Scopes and pull-request gates are configurable per service. See
[Poller filters and presets](?id=zai-cli&doc=docs--config--poller-filters-and-presets).

Dry-run a poller from inside the checkout you want to poll:

```text
zai poller:item                      # dev-service item poller
zai poller:pr                        # review-service pull request poller
zai poller:pr-babysitter             # pr-babysitter pull request poller
zai agent:run review --url <pr-url>  # one manual review run on a specific PR
```

## Labels

Workflow labels (tags on ADO) share one prefix, `zai` by default, set by the
`label_prefix` config field. A work item needs the marker label (`zai`) and
`zai-ready` before it is polled. The services then move it through
`zai-started`, `zai-blocked`, `zai-done`, and `zai-failed`. Add
`zai-investigation` to route an item to the investigation agent instead of the
code path. Pull requests use separate claim and state labels so two services
never act on the same pull request at once.

`zai config show` prints the effective `label_catalog` and the labels a new work
item must carry. Optional `custom_required_labels` let several workflows share
one repository. See the field reference.

## Configuration

A repository needs a config before services start. `zai config init` creates
one and `zai config update` edits it. Named profiles are managed with
`zai config profile add/use/delete/edit`. Configs live under
`~/.zai/configs/<repo-slug>/`. See the [configuration reference](?id=zai-cli&doc=docs--config),
[discovery and management](?id=zai-cli&doc=docs--config--discovery-and-management), and
[samples](?id=zai-cli&doc=docs--config--samples).

## Local run data

Each service run writes local state for its single item. Pollers and service
loops upload nothing; their only external effects are forge actions such as
opening a pull request, posting a review, or merging.

```text
~/.zai/runs/
  <service>/
    <repo-name>/
      run-<slug>-<timestamp>/
        request.json
        context-summary.json
        logs/
        result.json
```

The run folder and `context-summary.json` are the durable source of truth.
Conversation history is disposable. See
Service and local-data invariants.

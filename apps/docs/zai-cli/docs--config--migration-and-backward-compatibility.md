# Migration and backward compatibility

## Retired service configuration

Schema version 26 is the first version whose `services` map matches the current
service catalog. Loading an older config drops any service key outside that
catalog and persists the removal; all remaining service settings and profile
selections are preserved. A current-version config still rejects an unknown
service key as a typo. Retired agents, pollers, commands, and workflow labels
are no longer shipped or provisioned. Existing run folders and forge labels/tags
are not deleted, and the local-run schemas do not validate retired-service
records. Stop old workers before upgrading.

## Workflow branding

Schema version 25 adds `label_prefix`, defaulting to `zai`. Existing files migrate
without changing their labels or selection behavior. Set a team/project prefix
without a trailing separator (for example `team`); the marker becomes `team` and
all lifecycle names become `team-<unchanged-suffix>`. Per-stage overrides are not
supported. Extra `custom_required_labels` retain their additive meaning.

Changing this field does not rename forge labels/tags or discover old namespaces.
For an existing workflow, stop/drain every worker, migrate existing issue/PR
labels and ADO tags while preserving lifecycle roles, update every participating
worker/profile and any saved-query tag filters, then restart. Startup provisions
the configured catalog on GitHub. ADO tags are created when applied. Check
`config show`'s effective catalog before resuming. Do not run mixed-prefix workers
against the same workflow during migration.

A running daemon pauses further polling if its prefix changes and reports that
a restart is required. Already-dispatched runs retain their original immutable
label names through finalization, approval verification, and cleanup. Other
reloadable settings keep their existing behavior. Persisted comment receipts
such as reviewed-head and approval-head markers are protocol identifiers, not
labels, and are deliberately unchanged.

[Configuration index](?id=zai-cli&doc=docs--config) | Previous:
[Validation and boundaries](?id=zai-cli&doc=docs--config--validation-and-boundaries)

## Migration and backward compatibility

Profiles change the directory layout, not the config JSON schema, so they require
no schema-version bump or rewrite. An existing directory containing only
`config.json` has no `profile-settings.json` and therefore continues to select
`default`. Named profile files are normalized and migrated independently the
first time each one is loaded.

The project registry is seeded once when `~/.zai/projects.json` is missing.
Existing service history contributes forge projects with known checkout paths;
existing forge config directories contribute projects whose location is bound
later when a matching checkout is opened. This migration does not rewrite
service configs.

`Load` compares a file's `schema_version` against the current one. When the file
is older, `Normalize` fills every field added since (for example
`agent_timeout_minutes`, or a missing `poller` scope, populated from each
service's default preset so behavior matches the previous build), bumps
`schema_version`, and the upgraded file is rewritten in place — no manual edit is
required. Pre-existing values are preserved, never clobbered.

Schema version 4 changes poller gates from plain booleans to optional tri-state
overrides. During migration from schema 3 or older, files with an explicit
`poller.scope` keep the old authoritative meaning: every missing gate is written
as explicit `false`, and every present `true` remains `true`. Files with an empty
poller scope continue to resolve to the built-in service preset, so review keeps
its default checks gate on. A now-removed `require_needs_review` gate is ignored
on load and dropped on the next save; review de-dup is always applied regardless.

Schema version 5 originally added the project-level `console_yolo` toggle.
It is now an app preference with a per-project override: the installation home's
`settings.json` holds the app-wide default (YOLO off), and a project's
`console_yolo` overrides it only for launches in that project. Migration never
adds or rewrites the project field, so an absent value keeps inheriting and an
explicit `true` or `false` is preserved exactly. A legacy project opt-in is never
promoted into the app-wide setting.

Schema version 6 adds the review-service `review_vote` mode. During migration
from schema 5 or older, a review service with no `review_vote` field has it
filled with `default`, so the post-review approve/comment behavior is unchanged
after the upgrade; an operator can switch it to `comment-only` or
`always-approve` afterward in the config editor. The field is review-only: it is
never written to the other services.

Schema version 7 adds the interval-driven `housekeep` service. During migration
from schema 6 or older, a config with no `housekeep` service entry has one filled
in with the default model, a single-run agent limit, the default timeout, and the
default 3-hour `interval_seconds`, so the daemon's `start all` gains the
maintenance pass automatically after the upgrade; an operator can adjust its model
and interval afterward in the config editor's Housekeep section.

Schema version 8 added the top-level `automation_enabled` toggle — a
repository-wide master switch for console-mode automations. That switch has since
been **removed**: scheduled automations are now gated individually by each
automation's own persisted `enabled` state in `automation.json`, not by a config
field (see `automations.md`). Removing the field is not a schema
change (it adds no new default for `Normalize` to fill), so `schema_version`
remained 11 at that change and an existing config was not rewritten merely to
drop it. On the
first console start after upgrading, zai reads any lingering
`automation_enabled` value from the config, folds it into each definition as
`enabled = automation_enabled AND NOT disabled`, writes that per-automation state
durably, and only then drops the obsolete `automation_enabled` field from the
config. The migration is idempotent and failure-safe: if it cannot persist the
per-automation state, the legacy field is left in place and no schedule fires
until a later start migrates successfully.

Schema version 9 adds the top-level `notifications_enabled` toggle. During
migration from schema 8 or older, a file with no `notifications_enabled` field
has it filled with the default (`true`), so an upgraded install starts raising
error notifications for failed or timed-out runs until an operator turns them off.

Schema version 10 replaces the ADO per-service `area_path` with the dev-only
`query_id` (the saved work-item query the dev poller runs). This is not an
auto-convertible rename — an area path and a saved-query id are different things
— so migrating a schema 9 or older ADO config drops the now-unknown `area_path`
field and leaves `query_id` empty. An ADO operator must set `services.dev.query_id`
(via `zai config update`) before the dev poller can select work items
again.

Schema version 11 adds the top-level `custom_required_labels` string. It is
purely additive and optional, so migrating a schema 10 or older config needs no
value: the field stays empty (and, being `omitempty`, absent from the rewritten
file), which adds no labels and preserves current commands and behavior. An
operator can set it afterward in the config editor's General section; the next
`zai start` then extends its GitHub label preflight to provision any
missing custom labels.

Schema version 12 adds optional `services.<service>.agent_name` to every service,
including housekeep. Migration leaves it empty, preserving every existing
service-specific built-in. Resolution is intentionally outside schema migration
and pure config validation: save/start and live execution boundaries resolve the
logical name against the installed Copilot home and the repository derived from
the final Copilot working directory.

Schema version 13 adds optional `repo.github_host`. Existing `github.com` and ADO
configs leave it empty, preserving their serialized identity and paths. A newly
detected GitHub Enterprise repository records its normalized hostname.

Schema version 14 originally added `console_scrollback_lines` to project config.
It is now an app preference with default `2000` and bounds `200`-`50000`.
Legacy values remain on disk but are ignored, absent project fields are no longer
added, and no project value is imported into app settings. Edit Settings on the
left rail and restart the console to use a new scrollback depth.

Schema version 15 adds the housekeep-only `services.housekeep.maintained_branches`
list and `services.housekeep.detect_maintained_branches` toggle. During migration
from schema 14 or older, a config with neither field keeps an empty branch list
and has detection filled with its default (`true`). The behavior change is
therefore opts an upgraded install into synchronizing detected long-lived
branches as remote mirrors, while the stale-branch deletion gate still
recognizes only the default branch until an operator names branches explicitly.
An explicit
`detect_maintained_branches: false` is preserved rather than re-defaulted, and
setting `maintained_branches` turns detection off entirely.

Schema version 16 adds the top-level `max_total_agents` cap: the repository-wide
budget of concurrent agent processes across all services. During migration from
schema 15 or older, a file with no `max_total_agents` field has it filled with
the default (`10`). Per-service `agent_limit` values are preserved unchanged, so
the only behavior change is that their sum can no longer oversubscribe the
machine: with the current built-in limits (`3 + 4 + 4 + 1 = 12`) a fully loaded
install now runs at most 10 agents at once and the remaining services wait for a
free slot on their next poll. An operator who wants the previous unbounded sum
can raise the value in the config editor's General section.

Schema version 17 changes the persisted default for every service's `model` from
`auto` to `gpt-5.6-sol`. During migration from schema 16 or older, an omitted
model is filled with GPT-5.6 Sol and written back for dev, review,
pr-babysitter, and housekeep. Every explicit value is preserved, including
`auto` and supported pinned model IDs. This persisted default is separate from
interactive recovery: if a configured model is genuinely absent from a live
catalog, the console still resets only that unavailable value to `auto`.

Schema version 18 adds the ADO review-service-only
`services.review.ado_reviewer_groups` allowlist of display names or GUIDs.
Migration leaves it empty. That is an intentional coverage change for existing
ADO assigned-review configs: polling becomes direct-user-only and emits
`ado_reviewer_groups_not_configured` until an operator adds up to eight group
names or GUIDs in the config editor's Review section. The dev service's saved
work-item `query_id` is not a substitute for this review namespace.

Schema version 19 adds review-only `services.review.max_group_reviewers`.
Migration writes the default `3`. Profiles are complete config files, so each
profile stores and switches its own value. The assigned-scope self-author exclusion and
this group/team-derived cap apply on both GitHub and Azure DevOps.

Schema version 20 restores `auto` as the persisted default for every service's
`model`. During migration, an omitted model is filled with `auto` and written
back for dev, review, pr-babysitter, and housekeep. Every explicit value
is preserved, including `auto`, `gpt-5.6-sol`, and other supported pinned model
IDs. In particular, schema-17 configs that persisted GPT-5.6 Sol are not
silently rewritten because that value may be an intentional repository or
profile override; repositories that want Auto must select it explicitly.

Schema version 21 adds optional ADO dev-only
`services.dev.work_item_project`. Migration leaves it empty, so existing
configurations continue to use `repo.project` for both work items and the
repository without serializing a redundant override. When set, only work-item
selection and lifecycle operations move to that project; repository and
pull-request operations remain on `repo.project`.

Schema version 22 adds top-level `working_directory`. Migration writes the
default `.`, preserving the existing repository-root launch behavior. A
repository may instead select a forward-slash-delimited relative directory;
the next daemon start resolves it beneath the detected repository root and
fails before polling when it is missing, is not a directory, or escapes through
a symlink.

Schema version 23 adds housekeep task selection. Migration enables
`sync_maintained_branches` and leaves `cleanup_stale_worktrees` and
`cleanup_stale_branches` off. Explicit false for synchronization and explicit
cleanup choices survive normalization, profile saves, and live service reloads.
The former implicit stale-local-branch pruning is now opt-in; the synchronization
procedure and deterministic managed-pool maintenance remain unchanged. The
14-day cutoff is fixed, not configurable. Disabling all three skips the agent
pass without disabling managed-pool maintenance.

Schema version 24 adds `services.housekeep.cleanup_logs`, defaulting to false.
Existing installs do not opt into additional deletion. Explicit choices survive
profile saves and live reloads. This fourth task runs deterministic, install-wide
14-day diagnostic/session-log cleanup before any selected agent duties; selecting
only this task does not launch an AI agent. Existing automatic retention budgets
remain independent.

The change is also backward compatible: a newer file read by an older build is
not considered outdated, so the old build never rewrites or downgrades it, and Go
ignores fields it does not recognize. When you add a config field, bump
`SchemaVersion`, teach `Normalize` its default, `Default` its initial value, and
add or update coverage in `config_test.go` (see
`TestLoadFillsPollerDefaultsOnMigrationFromSchema2` for the migration pattern).

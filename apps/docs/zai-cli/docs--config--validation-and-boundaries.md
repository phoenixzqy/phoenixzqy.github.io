# Validation and boundaries

[Configuration index](?id=zai-cli&doc=docs--config) | Previous:
[Configuration samples](?id=zai-cli&doc=docs--config--samples) | Next:
[Migration and backward compatibility](?id=zai-cli&doc=docs--config--migration-and-backward-compatibility)

## Validation and boundaries

Every persisted per-repository and local project-config value has a defined boundary, so a config that
would misbehave is rejected with a clear, path-specific error rather than
silently clamped or run as-is. The shared contract is enforced from
`services/utils/config/validation.go`:

- the **config editor** rejects an out-of-range field on save; the form shows
  accepted ranges inline, while the native JSON editor shows field types,
  choices, defaults, and ranges in its adjacent rules pane;
- **`config.Save`** validates the normalized config before writing it to disk;
- **`Load`** (startup and every `config` command) validates the file; and
- the **daemon's live config reload** validates global fields plus the current
  service and pauses that service without polling if its config or effective
  agent definition is invalid; an invalid sibling service does not pause healthy
  loops, while malformed/global config still pauses all of them (rejections are
  logged and retried at a bounded cadence).

Bounds and their rationale:

| Value | Boundary | Why |
| --- | --- | --- |
| `poll_interval_seconds` | `30`–`86400` | Below 30s hammers the forge API; above 24h risks duration overflow and is effectively off. |
| `interval_seconds` (housekeep) | `30`–`604800` | Same 30s floor; capped at 7 days for this low-urgency maintenance pass. |
| `temp_retention_days` (app settings only) | `1`–`3650` | Defaults to seven days. Zero, negative, fractional and null values are rejected; invalid settings prevent automatic deletion. |
| `console_scrollback_lines` (app settings; accepted in legacy project files) | `200`–`50000` | Below 200 a pane cannot scroll back past a screenful on a tall terminal; every retained line is live heap for the pane's life, so the cap bounds console memory. |
| `console_device_status_interval_seconds` (app settings only) | `1`–`300` | A positive interval prevents a busy loop; the default five seconds balances freshness and idle sampling/rendering cost. |
| `max_total_agents` | `1`–`80` | Zero would stall every service; the ceiling is the theoretical maximum of all five services running their own `agent_limit` ceiling at once, so a configured value can never promise more parallelism than the per-service contract allows. |
| `agent_limit` | `1`–`16` | Zero would stall the service; each slot spawns a Copilot subprocess, so the cap prevents resource exhaustion. |
| `agent_timeout_minutes` | `1`–`1440` | A positive timeout guarantees a claim is always released; a run over 24h is treated as hung. |
| `model` | non-empty, ≤200 chars, no control characters | A model identifier is a short catalog name. |
| `agent_name` | empty or a logical name ≤200 chars; no Unicode controls, path separators, dot paths, drive/UNC/tilde/path forms | Copilot receives a logical definition name, never a filesystem path. |
| `working_directory` | `.` or a repository-relative forward-slash path ≤1024 chars; one leading `./` is accepted and normalized away; no absolute, tilde, colon, backslash, control, empty, other `.` or `..` segments; resolved path must exist inside the repository after symlink evaluation | Keeps unattended commands inside the configured repository while allowing a monorepository project to provide the agent's instruction and code-intelligence scope. |
| `custom_required_labels` | ≤20 labels, ≤50 chars each (plus the reserved-collision and leading-`-` checks) | 50 chars is GitHub's label-name limit. |
| `label_prefix` | 1–36 ASCII letters/digits with internal `-` or `_`; start/end alphanumeric; empty or omitted defaults to `zai` | Keeps every resolved name within GitHub's 50-character limit and prevents shell, prompt, and ADO tag-delimiter injection. Additional required labels cannot collide with the resolved catalog. |
| `default_pr_reviewers` | ≤25 reviewers, ≤256 chars each | Bounds an accidental fan-out of review requests. |
| `maintained_branches` (housekeep) | ≤16 branches, ≤255 chars each; no `refs/` prefix, leading `-`, `~`, `^`, `:`, `\`, or `..` | Each branch costs a fetch and a ref check per pass; the shape rules keep a configured value from being read by Git as a flag or a revision expression. |
| `review_vote` | `default` \| `comment-only` \| `always-approve` | Enum enforced. |
| `ado_reviewer_groups` | ≤8 unique display names or GUIDs; ADO review service only | Bounds group-list fan-out and prevents unverified reviewer identities from entering review discovery. |
| `max_group_reviewers` | `1`–`16`; review service only | Bounds duplicate group/team-derived automated reviews while retaining explicit individual review requests. |
| `query_id` (ADO dev) | valid GUID when set | The dev poller runs it as a saved-query id. |
| `work_item_project` (ADO dev) | bare project name or GUID, ≤64 chars; no URL, organization, credentials, controls, or path separators | Keeps the work-item mutation boundary explicit without changing repository/PR scope. |
| `poller.scope` | `assigned` \| `authored` \| `all` | Enum enforced (see above). |

Booleans (`console_yolo`, `console_device_status`, `notifications_enabled`) and the
tri-state poller gates (`include_drafts`, `require_checks_passing`) are
intentionally unbounded: every value they can hold is valid.

Non-forge project configs contain `schema_version`, the optional `console_yolo`
override, and a legacy `console_scrollback_lines` accepted for compatibility; the
same scrollback range above is enforced on load and save. The console reads app
preferences from the installation's `settings.json` and applies a project's
`console_yolo` over them; scrollback stays app-wide. A project config that fails
to load denies auto-approval rather than inheriting the app-wide value.

**Presence-aware migration.** Boundary enforcement distinguishes an *omitted*
legacy field from an *explicitly out-of-range* one. A numeric field that is
absent from an older file is still defaulted by `Normalize` exactly as before
(see [Migration](?id=zai-cli&doc=docs--config--migration-and-backward-compatibility#migration-and-backward-compatibility)); only a value that is
present on disk and violates its boundary is rejected. This preserves backward
compatibility for upgraded configs while refusing to silently run a value the
operator actually set out of range.

**Recovering a rejected config.** Because an out-of-range on-disk value now
fails `Load`, a pre-existing config carrying a value that predates these bounds
(for example an `agent_limit` above `16`) will fail startup and the affected
`config` commands with a path-specific error naming the field. Correct it by
editing `config.json` directly to a value inside the accepted range, or by
running `zai config delete` followed by `zai config show` to recreate defaults.
Deletion discards the repository's configs and profiles; repair the original
file when you need to preserve those settings. Automatic creation never replaces
an existing invalid config or falls back from a missing selected named profile.

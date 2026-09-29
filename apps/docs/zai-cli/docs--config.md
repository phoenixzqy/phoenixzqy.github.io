# Per-repository configuration

Workflow label branding is configurable with `label_prefix` (default `zai`).
Use a team/project prefix without the separator: `team` gives `team-ready`,
`team-started`, and the ownership marker `team`. Roles and suffixes do not change.
`zai config show` reports the effective catalog and work-item creation label sets.
See the field reference and migration chapter before renaming an existing workflow.

This document is the developer reference for zai configuration. Forge projects
use the established per-repository service config; git and directory projects
use a minimal local project config for console settings only. This guide covers
how configuration is discovered and generated, every field it holds, the
per-service poller filter, ready-to-copy samples, and how upgrades migrate old
files. For the product architecture around it, see
`architecture.md`; for the operator-facing command summary,
run `zai config -h` and `zai doc`.

New and migrated service entries default to `auto`, letting Copilot choose the
model. Repositories and profiles can pin `gpt-5.6-sol` or another supported
model explicitly.

Copilot, Pi and Codex are selectable through `coding_agent` without an opt-in setting.
Omitting it still selects Copilot. Service runs require the selected CLI on
`PATH` and fail explicitly when it is missing; changing the selection takes
effect at the next daemon start. `codex` requires codex-evo and separate
authentication in its managed home; see Codex setup.

The configurable services are `dev`, `review`, `pr-babysitter`, and `housekeep`.
See the migration chapter for retired configuration fields.

Review voting policies use a canonical verdict and end-of-run live-vote
verification on both forges; see the `review_vote` contract in the
field reference.

The repository-relative `working_directory` accepts either `packages/app` or
the equivalent `./packages/app`; the leading `./` is normalized away.

The console project registry lives at `~/.zai/projects.json`. Forge projects
reuse `~/.zai/configs/<repo-slug>/`; non-forge projects store
`config.json` under `~/.zai/configs/_project-<name>-<12-hex-sha256-prefix>/` with
`schema_version` plus an optional `console_yolo` override.

App-wide `console_yolo` and `console_scrollback_lines` live in
`~/.zai/settings.json` (under the active installation home), edited in the
left-rail **Settings** page alongside themes. Unlike themes, these edits are a
draft until saved with Ctrl+S; while any differ from the saved file the page
shows an unsaved-changes reminder, and Ctrl+R discards them. Defaults are YOLO off and 2000
scrollback lines; no project preference is imported into the app setting. A
project config may still set `console_yolo` to `true` or `false` to override the
app-wide toggle for launches in that project; omitting it (the default) inherits.
Scrollback is app-wide only. Themes retain the shared
`~/.zai/theme.json` and `$ZAI_THEME_CONFIG` contract. Service and automation
configuration stays project-scoped.

Housekeep exposes four independent task checkboxes: maintained-branch
synchronization (on by default), stale unmanaged-worktree cleanup (off), and
stale local/remote branch cleanup (off), plus zai/Copilot/Pi/Codex log cleanup (off).
Log cleanup is deterministic, uses file modification times strictly older than
14 days, and covers only the installed zai home's debug logs and agent session
transcripts. It preserves active sessions, session artifacts, and durable run
records; it never touches normal user agent homes. A log-only pass launches
no AI agent. Worktree and branch cleanup require verified ownership,
more than 14 days without activity, no open PR, and no data loss; uncertainty
means skip. Managed-worktree pool maintenance remains a separate deterministic
operation. With all tasks off, explicit housekeeping launches (including
`start all`) fail before agent initialization; enable a task or select services
without housekeep. Restart validates this before stopping an existing daemon.
Existing daemon loops skip subsequent agent passes after live
reload. See the field reference.

The complete configuration reference consists of this landing page and every
chapter below. Together, in this order, they are authoritative:

1. Configuration discovery and management
2. Configuration field reference
3. [Project registry and local project config](?id=zai-cli&doc=docs--config--project-registry)
4. [Poller filters and presets](?id=zai-cli&doc=docs--config--poller-filters-and-presets)
5. [Configuration samples](?id=zai-cli&doc=docs--config--samples)
6. [Validation and boundaries](?id=zai-cli&doc=docs--config--validation-and-boundaries)
7. [Migration and backward compatibility](?id=zai-cli&doc=docs--config--migration-and-backward-compatibility)

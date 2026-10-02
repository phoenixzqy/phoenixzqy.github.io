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

New and migrated service entries default to `auto`, letting the selected provider choose the
model. Repositories and profiles can pin `gpt-5.6-sol` or another supported
model explicitly.

Copilot (`copilot`), Pi (`pi`), Codex (`codex`), Claude Code (`claude`), and OpenCode (`opencode`, alias `oc`)
are selectable through `coding_agent` without an opt-in setting.
Omitting it still selects Copilot. Service runs require the selected CLI on
`PATH` and fail explicitly when it is missing; changing the selection takes
effect at the next daemon start. Console automations save their own `coding_agent` and `model` in `automation.json`.
The Automations editor remembers the last successfully saved pair for the
repository and preselects it for the next new automation. Either choice can be
changed. Definitions without a provider inherit the project's selection captured
when its scheduler is created; reopen the console after changing that inherited
selection. See Automations for the settings and defaults.
Codex setup covers the required codex-evo fork and managed
authentication. [Claude Code setup](?id=zai-cli&doc=docs--claude-code) covers its managed
authentication and model aliases.
[OpenCode setup](?id=zai-cli&doc=docs--opencode) covers isolated authentication, `provider/model`
identifiers, and native lifecycle differences.

The configurable services are `dev`, `review`, `pr-babysitter`, and `housekeep`.
See the migration chapter for retired configuration fields.

Review voting policies use a canonical verdict and end-of-run live-vote
verification on both forges; see the `review_vote` contract in the
field reference.

The repository-relative `working_directory` accepts either `packages/app` or
the equivalent `./packages/app`; the leading `./` is normalized away.

Adding or registering a project creates missing default config automatically
and adding through the console opens its Config right rail for review. Existing
settings and active profiles are preserved. Headless forge-repository onboarding
can use `zai config show`; it creates missing defaults and reports
`initialized=true` plus the effective label catalog. `zai start`, config update,
and profile list/add also ensure missing defaults. Invalid existing configs or
a missing selected named profile remain errors.

The console project registry lives at `~/.zai/projects.json`. Forge projects
reuse `~/.zai/configs/<repo-slug>/`; non-forge projects store
`config.json` under `~/.zai/configs/_project-<name>-<12-hex-sha256-prefix>/` with
`schema_version` plus an optional `console_yolo` override.

App-wide `console_yolo`, `console_scrollback_lines`, `console_device_status`,
`console_device_status_interval_seconds`, `console_focus_back`, and
`console_focus_forward` live in
`~/.zai/settings.json` (under the active installation home). The left-rail
**Settings** page edits YOLO, scrollback, and device preferences alongside
themes. Unlike themes, these edits are a
draft until saved with Ctrl+S; while any differ from the saved file the page
shows an unsaved-changes reminder, and Ctrl+R discards them. Defaults are YOLO off and 2000
scrollback lines, with CPU/MEM status in the footer on and refreshing every five seconds
(accepted interval: 1–300 seconds). Saved device preferences apply immediately
in the current console; Ctrl+R applies preferences saved by another console.
No project preference is imported into the app setting.
Navigation bindings default to `alt+left` (Back) and `alt+right` (Forward).
Edit them directly in `settings.json`, then press Ctrl+R in Settings to reload
live, or restart the console to apply; see the
app preference reference
for accepted keys, native aliases, and the Menu/prefix fallback. A
project config may still set `console_yolo` to `true` or `false` to override the
app-wide toggle for launches in that project; omitting it (the default) inherits.
Scrollback is app-wide only. Themes retain the shared
`~/.zai/theme.json` and `$ZAI_THEME_CONFIG` contract. Service and automation
configuration stays project-scoped.

The console remembers the last used coding-agent client separately in
`~/.zai/agent-client.json` (under the active installation home). For existing
projects, Sessions opens and receives keyboard focus at startup, selecting that client when available
or the first available client otherwise. Successful launches/resumes and
explicit Sessions client-tab selections update it automatically across projects;
New Tab and Split pickers also preselect the remembered client when launchable.
This preference does not change a service's `coding_agent`.

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

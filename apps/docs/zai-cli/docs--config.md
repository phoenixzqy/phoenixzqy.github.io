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

ADO organization auto-detection verifies access through Azure CLI before initializing
a config: it prefers the modern cloud endpoint, probes matching fetch URLs and
legacy aliases, and requires a repository GUID. A saved `repo.organization`
overrides detection and is retained by editors and profile copies. Failed
authentication or unsuccessful candidates leave the organization empty and surface
an error. See configuration discovery.

The Config JSON editor opens existing files without adding fields. Clean buffers
reload external changes automatically; dirty buffers preserve edits and refuse
conflicting saves. After confirming any discarded edits, closing and reopening
the file tab reads the latest disk version. See config management
for the rules pane and Form mode.

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
Fresh console coding-agent tabs and splits resolve it inside the selected
checkout or worktree, matching service launches. Saving a change affects the
next fresh console agent launch; resumed conversations retain their recorded directory.

Adding or registering a project creates missing default config automatically
and adding through the console opens its Config right rail for review. Existing
settings and active profiles are preserved. Headless forge-repository onboarding
can use `zai config show`; it creates missing defaults and reports
`initialized=true` plus the effective label catalog. `zai start`, config update,
and profile list/add also ensure missing defaults. Invalid existing configs or
a missing selected named profile remain errors.

The console project registry lives at `~/.zai/profiles/anonymous/projects.json`. Forge projects
reuse `~/.zai/profiles/anonymous/configs/<repo-slug>/`; non-forge projects store
`config.json` under `~/.zai/profiles/anonymous/configs/_project-<name>-<12-hex-sha256-prefix>/` with
`schema_version` plus an optional `console_yolo` override.

App-wide `temp_retention_days`, `console_yolo`, `console_scrollback_lines`, `console_device_status`,
`console_device_status_interval_seconds`, `console_focus_back`,
`console_focus_forward`, `editor_auto_save`, and `editor_auto_save_delay_ms` live in
`~/.zai/profiles/anonymous/settings.json` (under the active installation home). The left-rail
**Settings** page edits YOLO, scrollback, device preferences, and editor autosave alongside
themes. Unlike themes, these edits are a
draft until saved with Ctrl+S; while any differ from the saved file the page
shows an unsaved-changes reminder, and Ctrl+R discards them. Defaults are YOLO off and 2000
scrollback lines, with CPU/RAM status in both TUI and GUI footers on and refreshing every five seconds
(accepted interval: 1–300 seconds). Saved device preferences apply immediately
in the current interface. TUI Ctrl+R or GUI Reload applies preferences saved elsewhere.
Editor autosave defaults On with a 1,000 ms quiet delay (range 1–86,400,000 ms).
Saved values apply to new editor tabs, splits, rails and embedded project config
editors. Existing sessions keep their options; standalone editor launches are
independent. No additional watcher or polling loop is started.
No project preference is imported into the app setting.
Edit `temp_retention_days` directly in that app settings file (default 7, range
1–3650). Console and daemon startup plus local midnight share one daily cleanup
attempt; each attempt reloads retention. Recent descendants and held leases
protect temporary entries. See the app preference reference for the scope.
Navigation bindings default to `alt+left` (Back) and `alt+right` (Forward).
Edit them directly in `settings.json`, then press Ctrl+R in Settings to reload
live, or restart the console to apply; see the
app preference reference
for accepted keys, native aliases, and the Menu/prefix fallback. A
project config may still set `console_yolo` to `true` or `false` to override the
app-wide toggle for launches in that project; omitting it (the default) inherits.
Scrollback is app-wide only. Themes retain the shared
`~/.zai/profiles/anonymous/theme.json` and `$ZAI_THEME_CONFIG` contract. Service and automation
configuration stays project-scoped.

The console remembers the last used coding-agent client separately in
`~/.zai/profiles/anonymous/agent-client.json` (under the active installation home). For existing
projects, Sessions opens and receives keyboard focus at startup, selecting that client when available
or the first available client otherwise. Successful launches/resumes and
explicit Sessions client-tab selections update it automatically across projects;
New Tab and Split pickers also preselect the remembered client when launchable.
This preference does not change a service's `coding_agent`.

Housekeep exposes five independent task checkboxes in the TUI and GUI Project Config menus: maintained-branch
synchronization (on by default), stale unmanaged-worktree cleanup (off), and
stale local/remote branch cleanup (off), zai/Copilot/Pi/Codex log cleanup (off),
and permanent stale-session retirement (off).
Enable `services.housekeep.cleanup_stale_sessions` to retire conversations whose
last activity is strictly older than seven days across all repositories in this
install's five managed agent homes. The agent removes verified catalog/history
records and session-owned artifacts, not just transcripts. Active/open-pane,
pending, changed or uncertain sessions, independent user deliverables and durable
service runs remain protected. Closing a pane alone does not qualify a session;
retired sessions cannot be resumed. Retirement passes are serialized install-wide
and use the existing housekeeping cadence, with no new poller.
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

On macOS, application editing actions use Command (copy/cut/select all, undo/redo and save), Option+Left/Right moves by words, and Command+arrows moves to line/document boundaries. The default focus-history bindings use Control+- / Control+Shift+- so Option arrows reach the active text control. Terminal Control+C and the Control+Backslash host prefix keep their terminal meanings.

The complete configuration reference consists of this landing page and every
chapter below. Together, in this order, they are authoritative:

1. Configuration discovery and management
2. Configuration field reference
3. [Project registry and local project config](?id=zai-cli&doc=docs--config--project-registry)
4. [Poller filters and presets](?id=zai-cli&doc=docs--config--poller-filters-and-presets)
5. [Configuration samples](?id=zai-cli&doc=docs--config--samples)
6. [Validation and boundaries](?id=zai-cli&doc=docs--config--validation-and-boundaries)
7. [Migration and backward compatibility](?id=zai-cli&doc=docs--config--migration-and-backward-compatibility)
## Browser GUI listener and login

Profile-wide GUI configuration is separate from project/service configuration.
The left-rail Settings > GUI section in both interfaces edits the optional
login and exact `allowed_domains` in `gui.json` for non-local access and
HTTPS tunnels through a local proxy. `zai gui --tunnel` manages a Microsoft Dev
Tunnel; `zai gui --public-url` records an external HTTPS proxy origin. The public
URL and hosting status appear read-only in both Settings views. Login and
allowed-domain changes apply immediately.
See GUI listener and login for this workflow, bookmarks and port selection.
Outbound GUI servers use a separate private `remote-servers.json`, shared by
Settings > GUI > Outbound servers in TUI and GUI. See
GUI servers; this list is not project/service configuration.
Remembered remote capabilities live separately in private `remote-credentials.json`;
passwords are discarded and outages retain sign-in.

GUI companion preferences (`desktop_pet_kind`, `desktop_pet_enabled`, `desktop_pet_size`,
`desktop_pet_opacity`) and browser-local placement are documented in the
app preferences reference.

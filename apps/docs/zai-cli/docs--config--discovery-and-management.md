# Configuration discovery and management

[Configuration index](?id=zai-cli&doc=docs--config) | Next:
Configuration field reference

## How configuration works

Forge-project configuration is **per repository**, grouped by service. Each
repository has a default config and may have named profiles, each of which is a
complete config copy so testing or monorepo workflows can switch all service
settings and guardrails together. Git and directory projects have only the
minimal local project config described in
[Project registry and local project config](?id=zai-cli&doc=docs--config--project-registry).

- **Location:** `~/.zai/configs/<repo-slug>/`. `config.json` is the
  default profile, named profiles are `<name>-config.json`, and
  `profile-settings.json` records the active profile. A missing settings file
  selects `default`, preserving every existing installation.
  `<repo-slug>` is a filesystem-safe identifier derived from the repository's
  forge identity.
- **Project registry:** the interactive console lists projects from
  `~/.zai/projects.json`. Forge projects reuse the repository config directory
  below; non-forge projects have `_project-.../config.json` with console-only
  settings.
- **Profile selection:** every repository-scoped command resolves the active profile through the
  shared config loader. No profile flag is needed on `start`, `copilot`,
  `poller:*`, `agent:run`, or monitoring commands. A daemon pins the resolved
  config path when it starts; profile switching is rejected until that daemon
  stops. Restart an already-running interactive console after switching so all
  long-lived components for that forge project use the newly active profile.
- **Profile names:** names are normalized to lowercase, limited to 64 characters,
  and may contain letters, numbers, dots, underscores, and hyphens. `default` is
  reserved. Paths, separators, and dot-prefixed Windows device names such as
  `con.test` are rejected.
- **Automation:** `automation.json` remains repository-wide and is shared by all
  profiles, including each automation's `enabled` state. Other console settings
  come from the active config profile.
- **Repository identity:** `<repo-slug>` is a filesystem-safe identifier derived from the repository's
  forge identity (GitHub `owner/repo`, GitHub Enterprise
  `<host>/owner/repo`, or ADO `ado/<org>[/<collection>]/<project>/<repo>`).
  `github.com` keeps the established slug unchanged. GitHub Enterprise slugs
  include the normalized host and a stable SHA-256 suffix, so identities that
  normalize to the same filesystem-safe text cannot collide.
  For ADO, equivalent legacy and modern remote URL forms collapse to one canonical
  identity: `dev.azure.com` and `*.visualstudio.com` map to the same short org token,
  `DefaultCollection` is dropped case-insensitively, non-default named collections are
  preserved, and org/project/repo are canonicalized to lowercase. This normalization is
  config-directory-specific: daemon state, startup locks, poller status, automation
  history, and run discovery retain their established remote-derived runtime slug.
- **ADO compatibility and migration:** config lookup first checks the canonical slug and then
  falls back to an on-disk equivalent legacy ADO slug variant, so existing configs keep
  working even before migration. In interactive `zai copilot` mode only, whenever
  one or more equivalent legacy directories exist, startup lists every
  `legacy-slug -> canonical-slug` mapping and offers **Convert all** and **Not now**.
  **Convert all** preflights a recursive union of canonical and every legacy directory,
  aborting without mutation when any same-path setting differs or a source contains a
  symlink/special file. It migrates the complete union to the
  canonical slug under the custom-package system lock, then the canonical config coordination
  lock and deterministic compatibility locks shared by equivalent remotes, older runtime
  slug variants, and the custom-package installer. Every multi-lock path uses one global
  byte ordering so overlapping lock sets cannot deadlock. It refuses while any equivalent repo daemon is starting/running and
  transactionally rewrites matching `.custom-packages/*.json` tracked paths so package upgrade
  reconciliation remains valid. Committed legacy sources move to namespaced backups under
  `backups/config-migrations/`; an interrupted backup cleanup is retryable while canonical
  remains usable. Runtime slug-keyed directories are not renamed;
  interrupted case-only migration temp data is never deleted automatically. **Not now**
  or **Esc** continues using fallback lookup and shows the prompt again on each interactive
  console start while any legacy directory remains; service, daemon, and headless flows
  continue without a blocking prompt.
- **Creation:** `zai config init` opens the repository config page with an unsaved
  default JSON document and writes the default profile only when you save.
  `zai config update` opens the active profile. Inside `zai copilot`,
  the Config activity icon or the Right Rail menu (`ctrl+\ r`) opens it
  directly in the right rail; native pages are not offered by the tab/split app
  pickers. Forge projects open the repository config editor; git and directory
  projects open the local project config page. The native text editor is the
  default view, alongside
  contextual field types, allowed values, and defaults. The rules stack below
  the editor when the panel is narrow. Press `Ctrl+G` to switch to the form
  editor and back. The form's live model choices load in the background, so
  opening the page does not wait for the models API.
  In standalone `config init`, `config update`, and `config profile edit`,
  press Ctrl+C twice within 500 ms to quit without saving. The first press
  reaches the active editor or form immediately (including editor copy);
  another key or a longer pause starts a new attempt. The console's embedded
  page keeps its host-owned close shortcuts.
- **Creation without the editor:** every creation path above is an interactive
  TUI. A script or a coding agent instead writes `config.json` directly:
  `zai config path` prints the destination before the file exists,
  `zai config show` reports the detected repo identity to copy into it,
  and `zai doc` carries the minimal file shape and the verification
  step. `install-and-config.md` drives a coding agent
  through that flow end to end.
- **Outside a git repository:** read-only config CLI commands fall back to an in-memory
  default and **no file is written**; repo-scoped daemon commands require a
  recognized GitHub or ADO checkout. Console entry points work from any folder
  and use the project registry instead of this CLI fallback.
- **Source of truth:** the config schema and loader live in
  `src/zai/services/utils/config/` (`config.go`), the TUI editor under
  `src/zai/tui/mux/page/config/`, and the poller filter in `poller.go`.

## Managing configuration

| Command | Purpose |
| --- | --- |
| `zai config show` | Print the detected repository's config as JSON (configurable state only). |
| `zai config path` | Print the config file path for the current repository. |
| `zai config init` | Open the TUI editor to create the config (errors if one already exists). |
| `zai config update` | Open the TUI editor to edit the active profile. |
| `zai config delete` | Delete the current repository's config directory after its daemon stops. |
| `zai config profile` | List profiles and mark the active one. |
| `zai config profile add --name <name>` | Copy the default config into a new inactive profile. |
| `zai config profile use --name <name>` | Select the profile future commands load; rejected while the daemon runs. |
| `zai config profile delete --name <name>` | Delete an inactive named profile; default and active profiles are protected. |
| `zai config profile edit [--name <name>]` | Edit the named profile, or the active profile when omitted. |

The JSON editor validates the file before `Ctrl+S` writes it, preserving the
typed JSON layout and rejecting malformed or out-of-range values without
altering the disk file. Saving also checks that the config has not changed
outside the editor. Unsaved changes must be saved before switching modes;
the form keeps its Save button pinned to the bottom-right corner so it is
reachable from any scroll position. `zai start` requires an existing
config; run `zai config init` before starting services, or open
`zai copilot` and open Config from the right rail (`ctrl+\ r`).

Profile settings use their own versioned file:

```json
{
  "version": 1,
  "active_profile": "default"
}
```

Malformed settings, unsupported versions, or a selected missing profile are
reported as errors rather than falling back to another profile.

# Getting started

Documentation index

This guide installs zai, explains its two run modes and shared themes, and
lists every command. For the product overview, see the
repository README.

## Installation

### Remote one-line install

Releases are published publicly, so installing needs no GitHub sign-in, token, or
repository access. Run the one line for your platform.

macOS / Linux:

```bash
(installer=$(mktemp) || exit; trap 'rm -f -- "$installer"' EXIT; curl --proto '=https' --proto-redir '=https' -fsSL https://phoenixzqy.github.io/install/zai-cli.sh -o "$installer" && sh "$installer")
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/install/zai-cli.ps1 | iex
```

Each command is a single copy-and-paste line. The installer reads the published
[release manifest](https://phoenixzqy.github.io/releases/zai-cli/latest/manifest.json),
downloads the archive for your platform and architecture into the system
temporary directory, verifies its SHA-256 before using it, runs the bundled
package installer, and removes its downloads on success or failure without
touching files in your current directory. Open a new terminal afterwards to pick
up the persistent `PATH` change. `ZAI_INSTALL_DIR` chooses another destination
and any extra arguments are forwarded to the package installer.

Packages are pre-built, so no source clone or Go toolchain is required. Install
Python 3.10 or newer on PATH before running the installer. The bootstrap probes
for a working interpreter before downloading the release and stops with setup
instructions if none meets the minimum version. macOS/Linux also need `curl`
for the one-line command and `sha256sum` or `shasum` for verification; ZIP
extraction can use `unzip`, `bsdtar`, a ZIP-capable `tar`, or Python. The package installer does not install coding-agent CLIs. Hosted
launches can provision the supported npm-distributed Pi, Claude Code, and
OpenCode CLIs when missing; other providers must already be installed.

- App page: <https://phoenixzqy.github.io/apps/app/?id=zai-cli>
- All releases and checksums: <https://phoenixzqy.github.io/apps/releases/?id=zai-cli>

Each published release carries a human-readable changelog in its GitHub Release
body — the merged changes, PR and compare links, and source provenance. The
Release notes are the canonical changelog; see
`docs/version-management.md`.
How releases are built and published is documented in
`releases.md`.

### Repository setup

Follow [Install and configure zai](?id=zai-cli&doc=docs--install-and-config#configure-each-repository) for direct setup. From a supported repository, `zai config show` creates missing defaults; `zai config path` locates the active profile for editing. Use `zai doc` and command help for your installed version.

### What the installer sets up

Console activity icons are built in, with automatic readable text fallback when
terminal images are unavailable. No font setup is required.

The bundled Python installer creates `~/.zai` and installs `zai`, `zai-hook`, `zai-editor` and `zai-gitter` executables, and package-owned files there. It installs one Copilot home, `~/.zai/.copilot`, as a fresh, isolated, package-owned tree shared by service runs and the console. It never copies or merges your `~/.copilot` into it, and on reinstall or upgrade it replaces unchanged package-owned files while handling locally edited prompts through the conflict policy described below. Upgrading from a release with a separate `~/.zai/.copilot-console` prunes that home's unchanged packaged files; anything left there is inert and can be deleted. It does not read, delete, or mutate your original `~/.copilot` directory. Installing zai exposes `zai`, `zai-editor`, and `zai-gitter` on PATH; each tool
can also run independently. Installing either tool separately exposes only its
own command. Installing zai does not require a coding-agent CLI.

The installer also adds the install directory to your persistent user `PATH`
(the Windows user environment, or your shell profile on macOS/Linux) so you can
run `zai` directly in new terminals. This is idempotent across reinstalls. Open
a new terminal or restart/source your shell profile to pick up the change.

You may edit the packaged prompt files (the agents and skills under `~/.zai/.copilot`) in place. The installer records a checksum manifest of every file it writes, so on upgrade it replaces unchanged files silently but detects any prompt you modified. When a modified file also changed upstream, it shows an interactive prompt to **back up & install new**, **keep mine**, **overwrite without backup**, or **abort** (with an "apply to all" shortcut). Backups are written under `~/.zai/backups/<timestamp>/`. Non-interactive runs default to keeping your edits; use `--on-conflict` to force a policy.

### Updating

Reinstall the latest release:

```text
zai update
```

The command always uses the published release source without a source-selection prompt. Extra arguments are forwarded to the installer (for example `zai update --on-conflict backup`). The console update action asks for confirmation before closing and restarting sessions.


## Uninstall and remove local data

Close zai apps and stop services before uninstalling. These commands delete `zai-cli` and its app-owned local data, including edited settings and saved runtime/session data. Python 3.10+ is required.

macOS / Linux:

```sh
curl --proto '=https' --proto-redir '=https' -fsSL https://phoenixzqy.github.io/uninstall/zai-cli.sh | sh
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/uninstall/zai-cli.ps1 | iex
```

For a local script, download [zai-cli.py](https://phoenixzqy.github.io/uninstall/zai-cli.py) and run `python zai-cli.py --dry-run` to preview. Remove `--dry-run` to uninstall; pass `--install-dir /absolute/install/directory` for a custom installation. The Python, shell, and PowerShell scripts contain the same standalone cleanup implementation and do not fetch more code. Matching scripts also live in the source checkout; see its README for their location.

For hosted commands, set `ZAI_UNINSTALL_DRY_RUN=1` to preview or `ZAI_INSTALL_DIR` to select the absolute install directory before running the command. Shared theme cleanup respects `ZAI_THEME_CONFIG`. Editor cleanup also respects `ZAI_EDITOR_LSP_HOME` and `ZAI_EDITOR_PREVIEW_HOME`. Custom locations must be supplied again if they differ from their defaults.

For zai-cli outside the default `~/.zai` directory, an executable or installation manifest does not establish ownership of adjacent runtime data. If any cleanup target such as `backups`, `configs`, or `logs` exists, the uninstaller refuses before changing files or PATH. Review those paths' ownership manually; binary-only custom installations remain supported. A recovery marker does not override this safety check.

The uninstaller removes this app’s executable, licenses, app settings, and local data. It preserves sibling applications, Git worktrees, project files, independently installed coding agents and their normal homes, and unrelated files. The shared install directory remains on PATH while another executable needs it. Otherwise it removes the installer’s exact PATH lines from common shell profiles or the matching Windows user PATH entry. Manually authored shell PATH configuration remains yours to update. Open a new terminal afterwards; a piped shell script cannot change its parent shell’s environment. Failures report the affected path and return nonzero; correct the problem and rerun. A recovery marker remains after partial cleanup. The shared `releases/install.lock` is retained to coordinate future installations without replacing a lock another installer may hold.

zai cleanup includes its packaged and derived agent homes, configs, service state, runs, logs, backups, legacy private editor/viewer companions, and installer metadata. Standalone editor and viewer installations and their data remain. Git worktrees and their registry are retained because they contain project work.

## The two run modes

Both modes are implemented. **Service mode** runs an automated poller+agent loop; **interactive console mode** opens a TUI multiplexer that hosts Copilot CLI, Pi, Codex, Claude Code, and OpenCode sessions as tabs and split panes on their managed zai homes.

| | **Service mode** | **Interactive console mode** |
|---|---|---|
| Command | `zai start <all\|service>` | `zai` from any folder; choose agents from the app picker |
| Who drives | A repo-scoped daemon runs the selected deterministic service pollers; matching service agents act on selected items within configured limits | A human, live inside the console TUI multiplexer |
| Copilot home | `~/.zai/.copilot` | `~/.zai/.copilot` (the same home) |
| Pi home | `~/.zai/.pi`, launched with `--no-extensions` | `~/.zai/.pi` (the same home), loading the extensions of the Pi packages inherited from `~/.pi/agent` |
| Codex home | `~/.zai/.codex`, unattended full-access mode | `~/.zai/.codex` (the same home), normal interactive approvals unless console YOLO is enabled |
| Claude home | `~/.zai/.claude`, unattended print mode | `~/.zai/.claude` (the same home), normal interactive approvals unless console YOLO is enabled |
| OpenCode home | `~/.zai/.opencode`, unattended JSON run mode | `~/.zai/.opencode` (the same home), normal interactive approvals unless console YOLO is enabled |
| Copilot agent | launched per selected item with `--agent <service>-agent --autopilot --yolo -p <prompt>` | plain/default interactive copilot in each TUI tab or split pane (no service agent auto-launched) |
| Scope | every packaged agent and skill | every packaged agent and skill |

The managed homes carry the packaged agents, schemas, skills, and tools, so console mode exposes the harness agents and skills to you, including a few `zai-`-prefixed operator-facing skills that describe and drive zai itself. These homes stay separate from your personal coding-agent homes and state. Service sessions also appear in the console's resume list. See [Claude Code](?id=zai-cli&doc=docs--claude-code) and [OpenCode](?id=zai-cli&doc=docs--opencode) for installation, separate managed-home authentication, resource compatibility, and native differences.

Which mode do I want? Use **service mode** when you want zai to run automated poller+agent loops for the current repository. Use **interactive console mode** when you want a hands-on Copilot CLI session — in a project-based TUI multiplexer with tabs and split panes — with the packaged harness agents and skills available inside the session.

Shared invariant for both modes: provider home variables are set only in the spawned coding-agent child process through the spawn API. The terminal's own environment is never mutated, so there is nothing to restore on exit.

### Themes and settings

The console, `zai-editor`, and `zai-gitter` share one theme file, `~/.zai/theme.json` (`$ZAI_THEME_CONFIG` overrides the location). Until you pick a theme, the console and native Diff Review rail use Kanagawa Wave dark on any terminal background; the editor uses One Dark and follows the terminal background. Git viewer tabs follow the installed `zai-gitter` companion's default. Every app paints its whole screen with the theme's own colors, so light themes look right on dark terminals and vice versa.

Open **Settings** from the right activity bar or Right Rail menu to choose:

| Row | Applies to |
| --- | --- |
| Theme | The console itself (previewed live while you browse) |
| Editor theme | The editor rail and tabs, and the embedded config editor |
| Git viewer theme | The native diff rail and gitter tabs |

Pick from built-in themes such as Tokyo Night, Catppuccin, Gruvbox, Dracula, Nord, Rosé Pine, Kanagawa, and One Dark (families follow the terminal background). With no explicit selection, the console and native Diff Review rail use Kanagawa Wave dark even on a light terminal; the editor keeps its background-following One Dark default. **Reset to default** (`r`) restores those defaults; Git viewer tabs follow the installed companion's default (earlier `zai`, `zai-dark` and `zai-light` choices keep working as One Dark). Explicit app and shared selections remain selected. Saved changes, including hand edits to the file, apply to running apps immediately. `$ZAI_THEME` overrides every app for one launch, and a broken file never blocks startup: the apps fall back to the defaults and warn. `zai config update` and the Service Monitor page use the console theme. Inside zai, zai owns the tools' settings: editor tabs, the editor rail and gitter tabs launch with `ZAI_SETTINGS_HOST=zai`, so they hide their own F2 Settings (F2 points here instead), while still restyling live when you change the **Editor theme** or **Git viewer theme** row. See [theming](https://github.com/phoenixzqy/zai-design-system/blob/main/docs/theming.md) for the file format and custom themes.

## Command reference

Installed help is the source of truth: run `zai -h` for the summary,
`zai <command> -h` for exact syntax, and `zai doc` for detailed workflows.

| Command | Purpose |
|---|---|
| `zai` | Open the project-based console TUI and restore saved middle tabs, splits and conversations. Fresh workspaces show Welcome. `ctrl+\ n` opens an app. |
| `zai start <all\|service\|list>` | Start one repo-scoped background daemon that runs `dev`, `review`, `pr-babysitter`, and `housekeep` (`all`), one service, or a comma-separated subset. |
| `zai stop` / `zai restart` / `zai status` | Stop, restart with the same services, or show this repository's daemon. |
| `zai config <show\|path\|update\|delete\|profile>` | Manage the detected repository's config and named config profiles. |
| `zai repo-harness <eval\|eval-and-fix>` | Score a repository's docs, AI instructions/skills, and test-coverage readiness in an HTML report; `eval-and-fix` also fixes the issues found. |
| `zai doctor` | Check package layout and the configured coding agent's CLI availability. |
| `zai update` | Download the latest release and reinstall. |
| `zai version` / `zai doc` | Print the version, or detailed workflows and help pointers. |
| `zai poller:item` / `zai poller:pr` / `zai poller:pr-babysitter` | Run one round of a service poller for testing. |
| `zai agent:run <service>` | Invoke one configured service agent for testing; item services need `--url`. |
| `zai review:validate-comments` | Validate proposed review findings against changed diff lines. |
| `zai worktree <claim\|release\|cleanup>` | Internal: shared worktree claims used by agent sessions. |

Editor, Git viewer, coding-agent, and service-monitor surfaces open inside zai.
Their adjacent companion executables are implementation details rather than
standalone product commands.

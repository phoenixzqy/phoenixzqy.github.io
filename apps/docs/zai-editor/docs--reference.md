# Editor and integration reference

Back to zai-editor

Detailed usage, setup, and embedding guidance for the standalone editor and
its reusable Go packages.

| I want to... | Read |
| --- | --- |
| Build, install, and launch the editor | [Getting started](#getting-started) |
| Navigate files and tabs | [Editor scope](#editor-scope) |
| Read blame, file history, and linked PRs | [Git history](#git-blame-and-file-history) |
| Annotate code and prepare an agent request | [Comments and Ask AI](#comments-and-ask-ai) |
| Preview Markdown, Mermaid, or HTML | [Browser preview](#markdown-and-html-browser-preview) |
| Choose a theme | [Themes and settings](#themes-and-settings) |
| Edit several locations at once | [Multiple cursors](#multiple-cursors) |
| Embed the editor or package an archive | [Packages and distribution](#reusable-packages-and-distribution) |
| Contribute or understand ownership | [Development](#development) and architecture |

`zai-editor` is a standalone Go terminal editor and reusable Go
package extracted from zai's native editor.

Build from source or use a binary archive produced by the packaging script.
This private repository publishes Go modules directly through Git commits;
no package server, release tag, or release pipeline is required.

## Application relationships

| Repository | Responsibility |
| --- | --- |
| [zai-cli](https://github.com/phoenixzqy/zai-cli) | Agentic harness and console; consumes the editor and Git viewer packages and owns their console integration. |
| [zai-editor](https://github.com/phoenixzqy/zai-editor) | Independently usable editor app, executable `zai-editor`, and reusable Go editor packages. |
| [zai-gitter](https://github.com/phoenixzqy/zai-gitter) | Independently usable Git diff/review app, executable `zai-gitter`, and reusable Go viewer packages. |

The standalone apps must not require zai, a coding agent, or a sibling source
checkout. zai consumes versioned Go modules rather than retaining forked
implementations. Its existing rails, tabs, split panes, workspace behavior, and
all unrelated functionality must remain unchanged.

## Editor scope

Preserve the existing editor's document and undo lifecycle, conflict-aware
saves, bounded workspace search, syntax highlighting, optional language servers,
and Markdown source/preview identity. Standalone
editing must continue to work outside a Git repository. Git integration is
optional for editing; no external editor or npm runtime is required.

The standalone app and the package consumed by zai must share the same editor
implementation. zai owns host workspace selection, pane/rail placement, and
host lifecycle; those concepts do not become editor runtime dependencies.
Click a file or preview tab to select it; click its close control or middle-click
the tab to close it without first selecting it. Unsaved source edits use the
same "Save changes?" confirmation as Ctrl+W: Yes saves, No discards, and Esc
cancels. Closing the final tab leaves
the editor open.
Single-click a file in the tree to browse it in one reusable transient source
tab (italic filename); double-click the same file or its transient tab to keep
it open. Typing, pasting, deleting, or accepting a completion also keeps it open,
even after saving or undoing back to clean. A persistent tab is never replaced
by browsing. Tree keyboard Enter, Quick Open, and programmatic opens remain
persistent. This source-tab behavior is separate from the browser
preview opened with F7.
Quick Open (Ctrl+P) and workspace search (F6) wait until typing pauses for
500 ms before searching. The input label stays fixed; `Searching...` appears
only in the result list after the pause. Further edits or Escape cancel pending
and active searches.
Workspace content search and in-buffer Find (Ctrl+F/F3) match literal
substrings case-insensitively using Unicode simple case folding (not
multi-character expansion). Find skips matches that split a grapheme;
workspace result columns and navigation refer to the original text. Quick
Open and command filtering remain fuzzy.
In editable source, double-click a word to select it; drag after the second click
to extend by whole selection units in either direction. Unicode letters, numbers,
combining marks, and underscore form words; punctuation/symbol runs and horizontal
whitespace runs are separate units. Each unit stays within a line and never splits
a grapheme. Release retains the selection for copying or replacement; selecting
alone does not make a file dirty or keep a transient tab open. Browser previews
never edit or save the source buffer.

Editing accepts regular UTF-8 files up to 1 MiB, with an optional UTF-8 BOM,
consistent LF or CRLF line endings, and no NUL bytes. Mixed LF/CRLF and bare-CR
files are rejected. Pasted line endings are normalized separately, as described
under [Multiple cursors](#multiple-cursors).

### Git blame and file history

**Alt+B** toggles a code-history panel on the right. Drag its left divider
to resize it between 24 and 80 columns, leaving at least 32 columns for source
editing; the sidebar's right divider observes the same source minimum.
Divider dragging is unavailable while a command palette or Ask AI is open.
**Alt+H** focuses it;
**Esc** returns to the source so the panel can follow the caret or primary
selection after a 200 ms pause. With fewer than 90 content columns available,
the focused panel covers the editor body; Esc reveals the source again and
Alt+B brings the hidden panel back before it closes. Global chords such as
Ctrl+S, Ctrl+W and Ctrl+Tab keep working while the panel holds focus, while
text keys never reach the code behind it.
**F1 > Git history** lists toggling, focusing, blame/timeline mode, refresh,
opening or copying a commit URL, and finding, opening or copying a PR URL.
Commit selection also supports clicking entries or using the mouse wheel.
Timeline paging and selecting among associated PRs use the keys below.
On macOS, enable Option as Meta in the terminal or use F1.

| Key inside history | Action |
| --- | --- |
| Tab | Switch blame / file timeline |
| Up / Down | Select a commit |
| PageDown / PageUp | Next / previous timeline page |
| C or Enter / Y | Open commit / copy its URL |
| P / Shift+Y | Find, then open, the selected PR / copy its URL after a lookup |
| Left / Right | Select among associated PRs |
| L | Retry PR lookup |
| R or F5 | Refresh history and clear PR cache |

Blame groups the selected lines by their last-changing commit. It uses the
**unsaved buffer**, not disk line numbers, and labels changed/new lines as
uncommitted. A trailing empty caret row has no commit. Blame is limited to
2,000 selected lines and the editor's 1 MiB file limit. With multiple cursors,
history follows the primary selection only. Untracked files, unborn branches,
missing Git, and non-Git workspaces show an explanation without blocking editing.

The timeline shows up to 50 commits per page, follows file renames, and retains one
immutable revision across pages. It is file history, not the full evolution
of a selected line range. Timeline pages retain their revision until a refresh,
mode change, or file/panel reopen resets it; blame rereads when the buffer or
selected line range changes. There is no Git polling or auto-fetch.
The timeline displays at most 1,000 commits. Each Git command's standard output
is capped at 4 MiB, and each local history request has an eight-second deadline.
Slow or incomplete/shallow history is not silently fetched.
Git reads use literal paths, disable external filters/textconv and optional
index writes, and ignore inherited Git repository/index overrides.

Links use the `origin` remote and support GitHub.com and Azure DevOps Services
(including their HTTPS/SSH and legacy `visualstudio.com` remote forms).
Self-hosted GitHub Enterprise and Azure DevOps Server hosts are not yet supported.
Commit links require no network lookup; an unpushed commit may not exist on the
forge. URLs are terminal hyperlinks where supported, and keyboard open/copy
actions remain available. Copy uses the terminal's OSC 52 clipboard support.

**PR lookup is explicit**: P, L, or the corresponding F1 find/open PR commands
can query the forge. Requests use the repository identity and commit SHA,
plus authentication, never buffer text. Shift+Y copies an already looked-up
PR URL and never starts a lookup itself. For GitHub, use an existing
`gh auth login` session or `GH_TOKEN`/`GITHUB_TOKEN`. For Azure DevOps, use an
existing `az login` session with repository access, or `AZURE_DEVOPS_EXT_PAT`
with Code read permission. The editor never installs these CLIs or initiates
login. Credentials are not saved by the editor, and remote-embedded credentials
are not reused or displayed. Keep tokens out of repository files.

PR associations come from the forge API, including both ADO commit and
merge-commit queries, not guessed commit-message numbers. Multiple associations
can be selected. An empty successful result is distinct from a lookup error;
authorization and rate-limit failures may share an error message. Up to 20 PRs
are returned per lookup; more associations produce an explicit limit error.
Successful results (including empty results) use a 32-entry, five-minute,
in-memory cache. There is at most one local history job and one PR lookup per
editor, each cancellable on superseding selection or teardown. A static or
closed panel schedules no history work.

### Comments and Ask AI

Annotate the code you are reading and prepare a request for a coding agent
inside the editor. Standalone use copies the request for you to paste into your
agent; direct delivery requires a host that enables it. The editor uses the
shared design system's `annotation` primitives, `component/commentblock`, and
`component/composer`.

| Key | Command | Action |
| --- | --- | --- |
| Alt+C | Add comment | Comment the selection, or the caret's line when nothing is selected |
| Alt+A | Ask AI | Open the Ask AI dialog |
| Alt+] | Next comment | Activate and reveal the next comment |
| Alt+[ | Previous comment | Activate and reveal the previous comment |
| Alt+D | Delete active comment | Remove the active comment |
| Alt+Delete | Clear all comments | Remove every comment |

On macOS, terminals send Option chords only when they are configured to use
Option as Meta (iTerm2's "Esc+" setting, or Terminal.app's "Use Option as Meta
key"); the history chords already require the same. Every action is also in the
command palette (F1), which stays available when a terminal keeps a chord.

The comment draft is a single-line input shown under the source view: Enter
saves it, Esc closes the input and keeps the text for the next Alt+C. Drafts
are limited to 4000 characters and a session keeps at most 20 comments.

Saved comments render inline, right after the last line of the code they
anchor to, with a clickable `[Alt+D Delete]` control. They are virtual rows:
they are never buffer text, never saved to disk, never copied as source, and
never editable. An anchor records the path, the line/column range and the
document version, and the excerpt is captured from the *unsaved* buffer when
the comment is made — disk contents are never substituted for it later. A
comment is marked `(stale)` when its recorded line range no longer matches the
open buffer, including after edits or reloads, or when the document closes.
It keeps the text it captured; once stale, it does not become fresh again.

Alt+A opens the Ask AI dialog: Tab or Enter toggles editing and the preview,
Up/Down/PageUp/PageDown scroll, Ctrl+C copies the request, and Esc closes it.
The request carries the question, every saved comment with its captured
excerpt, and a bounded excerpt of the current selection, wrapped in the shared
untrusted-context framing and bounded to 128 KiB. Long code excerpts are
truncated with an `[excerpt]` marker. Copying uses OSC 52, so the terminal must
allow clipboard writes and you paste the request into your agent yourself;
the standalone editor never claims to have delivered it.

Hosts that can deliver the request call `Model.EnableAgentSend()`. That adds
the `Ctrl+S Send` control, and sending emits an `editorui.AskMsg` carrying the
model and the assembled `Prompt` for the host to route. Without it, Ctrl+S is
inert in the dialog and only copying is offered.

### Markdown and HTML browser preview

Press **F7** to open the current Markdown or HTML document in your default
browser through a built-in local HTTP server. HTML (`.html`, `.htm`) must be
saved with Ctrl+S first. Markdown (`.md`, `.markdown`, `.mdown`, `.mkd`) previews
the current buffer, including unsaved edits, without saving it. F7 publishes
a fresh Markdown snapshot; refresh the browser to load that snapshot. Refreshing
HTML reads its saved file and assets. There is no background live-reload poller,
frontend build tool, or separately installed backend runtime. The local server
runs as a helper process of the `zai-editor` executable.

Markdown supports tables, task lists, fenced code, images, and Mermaid diagrams.
Its renderer assets are bundled, so local documents and diagrams work offline
without Node.js, Python, a CDN, or a separately installed Markdown tool. Remote
images still require network access. The browser theme selector offers popular
design-system themes and stores the choice in browser localStorage, shared by
documents using the same preview origin. The terminal remains a source editor;
the old terminal Markdown/Mermaid/image renderer and F8 live split are removed.

The first preview asks which directory to serve: the document's folder, or
the editor workspace root when styles, scripts, images, or links need parent
directories. Only preview trusted files: HTML scripts can read other previews,
served roots and browser storage on the shared origin, including previews from
other editor processes. Separate document URLs are not security isolation.
The choice is remembered for the editor session. Use **F1 >
Choose browser preview root** to change it; files outside the chosen root prompt
again.

Directory listings, dot paths, and paths escaping that directory (including
symlinks) are denied. Browser capabilities are independent of document IDs.
Editor processes using the same preview metadata directory share one on-demand
server and loopback origin. Different root/file pairs have different document
URLs; editors previewing the same root/file pair share a URL and the latest
published Markdown snapshot.
Without a port override or remembered origin, the server tries ports 54321
through 54336 in order, without taking over another application's listener.
A running authenticated server is reused first; when starting a new server,
an allowed remembered port is tried before the remaining candidates.
Browser localStorage is origin-specific, so a port change can mean a different
saved theme; the editor and Markdown page disclose the change.

In-process hosts need the `zai-editor` executable alongside the host or on PATH
to start the shared helper. `ZAI_EDITOR_PREVIEW_HELPER` can select its executable
path. `ZAI_EDITOR_PREVIEW_PORT` accepts one TCP port or a comma-separated list
of candidate ports; an unavailable range reports an error instead of killing
another listener. Private server-discovery metadata lives in `zai-editor/preview`
under the OS user configuration directory. `ZAI_EDITOR_PREVIEW_HOME` can select
an absolute metadata directory, for example to isolate a test session. This
metadata contains no generated document HTML; the remembered origin persists
after shutdown so later launches can retain browser theme choices.

Generated Markdown HTML stays in memory, not temporary files. Each editor owns
its registrations through a live control connection. Closing a file tab
releases that editor's registration for the file; closing or killing the editor
releases all its registrations. A shared preview remains available while another
editor still owns it, and is removed when its last owner releases it. The
server exits after its last editor disconnects. Hiding a hosted editor is not
closing it. The server never terminates the user's browser.

Windows and macOS open the default browser; Linux uses `xdg-open`. Under WSL,
the editor detects WSL and launches the **Windows** default browser through
`powershell.exe`, with `wslview` as a fallback. Windows interop and Windows-to-WSL
localhost forwarding must be enabled. It does not bind to the LAN, change
firewall rules, or fall back to a Linux GUI browser under WSL. Immediate launcher errors
appear in the editor; if the browser cannot reach the page, check WSL localhost
forwarding.

## Getting started

The module root is this repository's root; its identity is
`github.com/phoenixzqy/zai-editor`. Use the Go version declared in
`go.mod`. Run these commands from a source checkout:

```text
go run ./cmd/zai-editor --help
go run ./cmd/zai-editor --root /absolute/workspace
go build -o zai-editor ./cmd/zai-editor
```

On Windows, use `-o zai-editor.exe`. Put the executable on your PATH to run
`zai-editor [--root directory] [file]` from any workspace. Git is optional.
`--lsp-config` (or `ZAI_EDITOR_LSP_CONFIG`) enables explicitly configured
language servers.
Installed language-server presets are disabled by default. In a trusted
workspace, pass `--lsp` or use **F1 > Enable built-in language servers** for
this session; matching servers then start on demand and may execute project
tooling. Installing a server does not enable it in other workspaces.
Use `--lsp=false` or **F1 > Disable built-in language servers** to disable
presets; explicit `--lsp-config` entries remain enabled.
The built-in catalog covers React/React Native JSX/TSX, web frontend
and backend languages, mobile toolchains, and configuration formats without
bundling servers or downloading during editing. Install and configure a supported
server with the same command on Windows, macOS, and Linux:

```text
zai-editor lsp install go
zai-editor lsp install typescript python html css json yaml
```

Installing the pinned `gopls` needs Go 1.26+; the npm-based installers need
Node.js + npm (Node.js 24 LTS recommended). For these managed installations,
no global server installs or manual JSON/PATH wiring are needed.
**F1 > Install LSP servers** shows each one-liner; Ctrl+C copies just the command.
Read the [LSP setup guide](?id=zai-editor&doc=docs--lsp-setup) for prerequisites, supported
installers, storage, troubleshooting, and manual-only servers. See the maintained
[language/framework support matrix](?id=zai-editor&doc=docs--language-support) for exact coverage,
setup, and limitations. With a matching enabled server, typing an identifier
or `.` requests completion after a 250 ms pause;
Ctrl+Space (or F1 > Complete code) requests it manually. Up/Down selects,
Tab/Enter accepts as one undoable edit, and Escape dismisses.
Each editor owns its language-server processes; closing one does not stop
another editor's servers.

### Themes and settings

With no configured selection or override, the editor follows the terminal's
background using One Dark or One Light. The editor paints its screen with the
selected theme's foreground and background colors. Press F2 (or
run `Settings` from F1) to choose any theme from the shared catalog. The
highlighted theme previews live; Enter saves it and Reset to default returns
to the One Dark/One Light variant for the current background. Choices are saved in
the shared zai theme file (`~/.zai/theme.json`, or `$ZAI_THEME_CONFIG`) under
`apps.zai-editor`, and a running editor applies changes to that file live,
including changes made from zai's Settings page.

Inside zai (editor tabs and the editor rail), zai owns the editor's settings:
zai launches it with `ZAI_SETTINGS_HOST=zai`, so the editor hides its own
F2 Settings and `Settings` command, and F2 points you to zai's Settings page.
The editor still follows the shared file, so zai's **Editor theme** row
(saved under `apps.zai-editor`) restyles it live. Run standalone, the editor's
own Settings edit that same entry.

`--theme <name>` (a theme or a family such as `catppuccin`) and
`$ZAI_THEME` override the configured selection for one session; the flag takes
precedence. Saving a theme through the editor's own Settings clears that
session override. `--theme dark` or `light`
keeps its original meaning: assume that background instead of following the
terminal, so the default is onedark-dark or onedark-light, and families use that
variant. `--theme auto` is the default behavior.
An invalid theme file never stops the editor: it reports the problem and
keeps the last good themes.

### Multiple cursors

Editable source supports several independent cursors. Alt-click (Option-click
on macOS) a source position to add a caret, Alt-click an extra caret to remove
it, and click normally or drag to return to one. Add Cursor Above/Below uses
VS Code's platform chords (Windows Ctrl+Alt+Up/Down, Linux Shift+Alt+Up/Down,
macOS Cmd+Option+Up/Down); F1 > **Add Cursor Above** /
**Add Cursor Below** works when a terminal intercepts the chord. Added
cursors land on adjacent logical lines, not soft-wrap
continuation rows, and keep the display column they started from across short
lines, tabs, and wide characters.

Typing, Backspace/Delete, word delete, Enter with each caret's own indentation,
and Tab edit at every cursor. Each editing gesture is one document transaction
and one undo step that restores the whole cursor set. Ordinary and Shift
navigation move all cursors but do not create undo steps.
Ctrl+C and Ctrl+X join the non-empty selections in document order
with LF, and a paste with exactly one line per cursor distributes those lines;
any other payload is pasted whole at every cursor. Escape drops the extra
cursors while keeping the primary selection, and a second Escape collapses it.
Terminal pastes accept LF, CRLF, and bare CR line breaks, normalizing them before
insertion or per-cursor distribution. Saving preserves the document's line-ending
style; invalid UTF-8, NUL bytes, and edits exceeding the 1 MiB limit remain rejected.
Completion is unavailable while several cursors exist and says so for manual
requests; an explicit jump (find, go to line, cursor history, opening a file)
returns to one cursor, while scrolling and resizing keep the set.

**Add Next Occurrence** selects repeated text in the active editable source
buffer: Ctrl+D on Windows/Linux, Cmd+D on macOS, or **F1 > Add Next
Occurrence** when the terminal cannot forward Command. With one empty caret,
the first press selects only its word (letters, numbers, marks, and underscore;
no punctuation or whitespace); subsequent presses match that whole word with
case sensitivity. With an existing non-empty selection, including a
double-click selection, the first press adds the next literal,
case-insensitive substring match, even across lines. Matching never changes
Find/F3 options. Each press adds one non-overlapping selection, searches from
the last addition toward EOF, then wraps; a status reports exhaustion or the
1024-selection limit. Typing replaces all selections in one undoable edit.
Manual selection changes, editing, undo/redo, navigation, reloading, or
switching focus/document starts a new search session. A mixed or unequal
manual selection set is rejected without changing it. Escape returns to one
selection and then collapses it. Matches never split Unicode grapheme clusters,
and only the current document (up to 1 MiB) is scanned on each press.
Terminals that send Cmd+D as plain D or a host-owned shortcut cannot trigger
the action; use F1 instead.

In editable source, Ctrl+Backspace (Windows/Linux) or Option+Delete (macOS
Backspace, delivered as Alt+Backspace) deletes backward by word; a selection is
deleted instead. Configure the terminal to send Option as Esc/Meta/Alt on macOS.
Ctrl+Backspace needs distinguishable terminal key reporting (such as Kitty
keyboard protocol or xterm modifyOtherKeys); if the terminal sends plain
Backspace, Ctrl+H, or Ctrl+W, the editor retains those keys' existing behavior.
Cmd+Delete is not a substitute. See `zai-editor --help` for shortcut details.

## Reusable packages and distribution

Import `editor/document`, `editor/workspace`, `editor/lsp`,
or `tui/editor` under the module path. `tui/editor.New` creates a Bubble Tea
model; the caller owns terminal startup and must call `Close`. `cli/editor.Run`
provides the same standalone command behavior without terminating the process.
Construct its model with `github.com/phoenixzqy/zai-design-system/theme` values.
`Model.SetThemeSession` makes a `themeconfig.Session` the theme source (the
shared theme file with live reload, optionally the terminal background, and the
F2 Settings dialog); hosts that choose the theme themselves call `Model.SetTheme` instead.
Hosts can call `Model.CurrentDocument()` for a read-only copy of the active
document's path, normalized text, zero-based caret line/column, and dirty state
(or `false` when no document is open). `Model.SetSaveValidator` optionally
checks each save before the disk write. Its callback receives the resolved file
path and exact encoded text to be written, including any BOM/CRLF; returning an
error shows it in the editor status and keeps the buffer dirty. A nil callback
disables validation. The callback runs in the asynchronous save command and
must be safe for asynchronous use; `New` and standalone saves remain unchanged.
Like the executable's default, `tui/editor.New` keeps built-in servers disabled
until explicitly enabled. `Model.SetBuiltinLanguageServers(true)` opts a host's model
into the same installed-server presets; false disables new built-in requests without changing
explicit configurations. No server starts until completion or definition is
requested. Hosts must call `Model.Close` when disposing the model to stop its
owned servers; hiding/reopening a view is not disposal.
Browser previews use the same implementation in standalone and hosted models.
The removed `editor/markdown` and `tui/previewimage` packages are not supported
imports; browser rendering replaces their terminal-specific contracts.
The executable loads managed presets through `editor/lsp/setup.Load` when
started with `--lsp`, or when they are enabled through F1.
Hosts wanting the same managed servers can load them outside the update loop and
call `Model.SetInstalledLanguageServers(configs)` before starting the model.
This overlays PATH presets without enabling them; explicit user entries still
win and `SetBuiltinLanguageServers(false)` disables all presets. Passing nil
restores PATH presets. The model copies command arguments and initialization
options; the caller can subsequently release its configuration map.
`NewWithInitialDocument` opens a host-supplied text buffer at a missing path
within the workspace without creating a file. The first default save creates
the file only if it is still missing (an exclusive-write fallback is used on
filesystems without hard-link support). If a file appeared at that path in the
meantime, that save is refused without touching it, the unsaved edits stay in
the buffer, and the editor rebinds the document to the file on disk; saving
again deliberately replaces it through the ordinary conflict-aware path. If
that file's identity cannot be recorded (for example it grew past the editing
limit), the edits stay in the buffer for saving to another path.
`Model.SetSaveHandler` optionally replaces the default
`document.Save(snapshot)` call with a callback receiving that same
snapshot and returning `(document.Stamp, error)`. The editor re-reads the
written file and derives the stamp it tracks from it, so the returned stamp is
advisory. Hosts needing an atomic
validation-plus-write transaction can acquire their lock, validate
`snapshot.Path` and `snapshot.Data`, and call `document.Save(snapshot)` under
that lock for both existing and initially missing files. Use the save handler
instead of `SetSaveValidator` when validation and writing must share a lock;
the standalone default remains unchanged. The editor verifies the committed
bytes before clearing dirty state; nil restores the default save. A committed
save whose staged temporary file could not be removed returns a stamp with a
non-nil `Stamp.Warning()` and a nil error. A host must advance its saved baseline
on nil error and pass the returned stamp to the editor, which reports the warning
in its status line. Host-owned writers can use `Stamp.WithWarning(err)` to report
their own committed cleanup warnings. A non-nil save error refuses the save.
Warnings describe only the current save; the buffer's later snapshots do not
retain them.
For in-process layouts, `Model.SetEmbedded(true)` changes confirmed editor quit
to a `CloseRequested` message instead of `tea.Quit` and leaves teardown to the
host (`Model.Close`). `Model.Dirty()` reports unsaved changes across all open
buffers, including inactive tabs, so hosts can protect editor state when
changing views. `Model.Saving()` reports a pending editor save command so hosts
can defer view changes or teardown until its result arrives. The default mode
retains the standalone quit behavior.
`Model.SetFileTreeVisible(false)` starts or redraws an embedded layout without
the editor's file tree, leaving more room for the text and preserving the
buffers; pass `true` to show it again. It sets the current visibility only: the
editor's Ctrl+B and Ctrl+E shortcuts stay active and can show the tree again, so
a host with its own explorer either accepts that or keeps those keys from
reaching the model.
`Model.SetWorkspaceFileActionsEnabled(false)` hides and blocks workspace file
and folder creation/deletion/moving through command and file-action palettes, tree
shortcuts, mouse/context actions, confirmations, and queued file commands.
Document editing and saving, navigation, and read-only path-copy commands
remain available. File and folder moves keep their basename and require an
existing workspace-relative destination folder (`.` selects the root). Moves
preserve open buffers and their unsaved edits; collisions are refused without
replacing or merging entries. Rename, file-copy, and cross-workspace moves are
not offered.
The default remains enabled for standalone use; set this before forwarding
host input, since an already-running file operation cannot be undone. Applying
the value already in effect is a no-op, so it neither cancels a running file
operation nor rewrites the status line.
These host methods read and write ordinary model state: call them from the
goroutine that runs the Bubble Tea program's `Update`, or before the program
starts. Only the callbacks they install (`SetSaveValidator`, `SetSaveHandler`)
run asynchronously in the save command.

```text
python scripts/package.py --output dist
```

The default archive version is Go's canonical version of the clean, already-pushed
local HEAD commit. Untagged commits receive unique pseudo-versions; existing
semantic tags remain valid. It does not increment a version file or create tags.
Unpushed commits or missing Git read credentials fail explicitly. Use
`--version v0.0.0-local` for an uncommitted local snapshot.

This produces a deterministic source ZIP and a native executable ZIP, each
with a SHA-256 sidecar. Binary ZIPs include dependency/runtime and embedded-asset
notices under `licenses/`; preserve these when distributing or installing them.
Use `--source-only` for source alone or `--goos` and
`--goarch` to cross-build. Extract a binary archive into a directory on PATH;
no registry, runtime zai install, or sibling clone is needed.

### Consume from Git

Commit and push through the repository's local pre-push gate. Every pushed
commit is available as a Go module; no archive upload or publish job is needed.
Consumers need Git read access (for example through `gh auth setup-git`) and must
add `github.com/phoenixzqy/zai-editor` to `GOPRIVATE` before fetching, preserving
existing private patterns. For example, from a consumer module:

```text
go get github.com/phoenixzqy/zai-editor@<commit>
go mod tidy
```

Go writes the canonical version and checksums to `go.mod`/`go.sum` and downloads
source into its module cache. Do not invent pseudo-versions. `@latest` prefers
release tags, so it is not a way to follow every default-branch commit.
zai-cli's package builder resolves the remote default-branch HEAD on every build
and pins the resulting version; its `--locked-tools` option reproduces prior
pins. Updating source does not change already-installed binaries.

Source manifests record every file hash, the source revision, and whether the
source checkout was dirty. See provenance, including
the patched Bubble Tea requirement: Go does not inherit module replacements and
excludes nested modules from downloaded module ZIPs. Hosts must supply compatible
terminal patches themselves. Build the standalone app from a checkout or use its
binary archive; `go install ...@version` does not support the module's local
replacement directives. Source archives remain optional standalone artifacts,
not the transport used by zai-cli. Change the source here, never the module cache.

## Development

For an offline-friendly set of example documents, open the
`demo` collection: a styled HTML landing page, a broad
Markdown showcase, Mermaid diagrams, and original local artwork. The collection
also distinguishes supported preview features from optional Markdown dialects.

Start with contributor guidance,
canonical contributor instructions,
architecture, and
testing and operations.
Repository development skills live under `.github/skills`.
Root `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` are tracked relative symbolic
links to the canonical `.github/copilot-instructions.md`; edit only the
canonical file. On a symlink-capable checkout, all four paths show the same
guidance. Non-Copilot agents should also read
`.github/instructions/security.instructions.md` for security-relevant work.

On Windows, enable OS symlink creation (Developer Mode or appropriate symlink
privileges) and Git's `core.symlinks=true` before checking out these tracked
links. A fresh clone with symlink support is the simplest way to obtain them
if an existing checkout materialized them as files. Verify Git tracks each
entrypoint with mode `120000` using
`git ls-files -s AGENTS.md CLAUDE.md GEMINI.md`, then verify the checkout
actually contains links (in PowerShell,
`Get-Item -Force AGENTS.md,CLAUDE.md,GEMINI.md | Select-Object Name,LinkType,Target`;
`LinkType` should show `SymbolicLink` and `Target` should point to
`.github/copilot-instructions.md`). The Git mode alone does not prove that the
working-tree files are links. If an entrypoint instead contains just the text
`.github/copilot-instructions.md`, read the canonical file directly. Native
Windows link behavior must be checked on the Windows checkout in use.

### Guidance provenance

Reusable contributor rules and skills were adapted from
[zai's repository guidance at the initialization baseline](https://github.com/phoenixzqy/zai-cli/tree/56bc3e40bc579914ae52fb942abfbd4447a6e2fc/.github).
Go correctness, review, cross-platform, performance, and text-screenshot rules
are retained. zai service/poller, packaged-home, site, and runtime-log skills
are not applicable here. Profiling methodology is retained as text; the Python
collector and its tests are not included in this guidance.

These are local, independently maintained copies, not an automatic sync. Review
shared policy fixes for applicability in all three repositories without copying
product-specific rules into the wrong owner.

# User guide

This guide covers installing, launching, and using the standalone
`zai-editor` app. The editor also runs inside zai, but standalone use does not
require zai, a coding-agent account, a source checkout, or a Go toolchain.

## Install and launch

macOS / Linux:

```bash
curl -fsSL https://phoenixzqy.github.io/install/zai-editor.sh | sh
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/install/zai-editor.ps1 | iex
```

The installer selects the package for your platform and architecture, verifies
its SHA-256, installs `zai-editor` under your home directory, and updates the
Windows user `PATH` or common macOS/Linux shell profiles. The macOS/Linux
installer needs Python 3, `curl` or `wget`, `sha256sum` or `shasum`, and a ZIP
extractor such as `unzip`, `bsdtar`, `tar`, or Python. Open a new terminal after
installing, then run:

```text
zai-editor
```

Run `zai-editor path/to/file` to open a file or
`zai-editor --root path/to/workspace` to choose a workspace root. Git is
optional. The core editor does not need Python, Node.js, a language server, or
another editor after installation.

### Open a source location

Pass one file with a line and optional column, for example
`zai-editor src/main.go:42:7` or `zai-editor "a folder/main.go:42"`.
Flags still precede the single file argument. Relative paths use the workspace
root; locations do not relax workspace access or file-format limits.

In **Ctrl+P Quick Open**, enter `path:line` or `path:line:column`.
The suffix is shown as a destination hint, not searched as part of the
filename. Enter opens an exact path directly, otherwise applies the position
to the selected fuzzy match. Existing open buffers are reused, retaining
unsaved edits and undo history. Go Back/Forward restores the previous location.
`:42` remains the separate form for line 42 of the active buffer.

Lines and columns are positive, one-based integers; an omitted column is 1.
Columns count Unicode code points in the logical source line, not bytes,
UTF-16 units, tab cells, or wrapped screen rows. Positions inside a combined
character or emoji snap to its start. A line past EOF clamps to the last
logical line, then a column past that line clamps to its end, with a status
notice. Empty files resolve to their initial caret.

An exact existing filename such as `notes:12`, or an exact already-open buffer,
wins over suffix parsing on systems that support literal colon filenames.
Trailing nonnumeric colon text remains filename text; zero, negative, and
overflowing explicit positions show an error unless the complete literal path
exists. Drive prefixes, UNC paths, and colons in directories stay path text.

Quick Open may remove one balanced pair of single or double quotes around
the complete input. It does not interpret shell escapes or expand variables.
CLI arguments have already been decoded by your shell and keep their literal
characters; do not add another layer of quotes inside the argument.
Invalid CLI positions are reported before terminal startup. Invalid palette
positions keep the palette open so you can correct them.

Installing this app exposes only `zai-editor`. Installing zai-cli exposes
`zai`, `zai-editor`, and `zai-gitter`, which can also run independently.

If your shell does not load `.profile`, `.bashrc`, or `.zshrc`, add the
installation directory (normally `~/.zai`) to that shell's PATH yourself.

The packages are unsigned. macOS may quarantine the download, and Windows
SmartScreen may warn about it. Follow your device and organization security
policies rather than disabling them.


## Select several tree entries

Use Ctrl-click (Cmd-click when your terminal reports it) to toggle entries,
or Shift-click for a visible range. Keyboard alternatives are Ctrl+E to focus
the tree, Shift+Up/Down to select a range, Space to toggle an entry, and Ctrl+A
to select all visible entries. Right-click a selected entry to keep the group
and choose delete, move, duplicate, or copy names/paths. Ctrl+C in the tree
copies relative paths, one per line.

D duplicates selected files beside their originals with unique names such as
`notes copy.txt`. Save dirty source files first; folders cannot be duplicated.
Press Delete in the focused tree to delete the selected file or folder (or
selected group). The confirmation box defaults to Cancel: Enter, N, or Esc
cancels; select Delete and press Enter, click Delete, or press Y to confirm.
Deletion is permanent, includes folder contents, and refuses unsaved buffers. Bulk operations stop on
an error and report completed entries; completed operations remain applied.
See tree selection and bulk actions
for selection, move, and terminal-modifier details.

## Uninstall and remove local data

Close zai apps and stop services before uninstalling. These commands delete `zai-editor` and its app-owned local data, including edited settings and saved runtime/session data. Python 3.10+ is required.

macOS / Linux:

```sh
curl --proto '=https' --proto-redir '=https' -fsSL https://phoenixzqy.github.io/uninstall/zai-editor.sh | sh
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/uninstall/zai-editor.ps1 | iex
```

From a source checkout, run `python scripts/uninstall.py`, `sh scripts/uninstall.sh`, or `& ./scripts/uninstall.ps1`. The Python entrypoint uses its adjacent file-support module; both wrappers embed the same cleanup implementation and do not fetch more code. The wrappers run Python in isolated mode, so modules in the current directory or `PYTHONPATH` cannot intercept their imports. Preview with `python scripts/uninstall.py --dry-run`; pass `--install-dir /absolute/install/directory` for a custom installation.

For hosted commands, set `ZAI_UNINSTALL_DRY_RUN=1` to preview or `ZAI_INSTALL_DIR` to select the absolute install directory before running the command. Shared theme cleanup respects `ZAI_THEME_CONFIG`. Editor cleanup also respects `ZAI_EDITOR_LSP_HOME` and `ZAI_EDITOR_PREVIEW_HOME`. Custom locations must be supplied again if they differ from their defaults.

The uninstaller removes this app’s executable, licenses, app settings, and local data. It preserves sibling applications, Git worktrees, project files, independently installed coding agents and their normal homes, and unrelated files. The shared install directory remains on PATH while another executable needs it. Otherwise it removes installer-marked PATH exports whose directory normalizes to the installation (including trailing slashes and equivalent spellings) from common shell profiles or the matching Windows user PATH entry. Manually authored shell PATH configuration remains yours to update. Open a new terminal afterwards; a piped shell script cannot change its parent shell’s environment. Shared metadata and shell profiles are staged beside their originals and replaced atomically only after the staged write and close succeed; failed writes leave the original bytes and permissions intact. Failures report the affected path and return nonzero; correct the problem and rerun. A recovery marker remains after partial cleanup. The shared `releases/install.lock` is retained to coordinate future installations without replacing a lock another installer may hold.

Editor cleanup includes managed language servers, profiler logs, and preview endpoint metadata. Workspace documents, externally installed language servers, and browser storage remain. Close browser previews before uninstalling.

## Everyday controls

- `Ctrl+P` opens Quick Open.
- `Ctrl+F` finds text in the current buffer.
- `Ctrl+H` opens **Replace in file** (also available from F1).
- `Ctrl+S` saves.
- `Ctrl+Shift+P` or `F1` opens the command palette.
- `F2` opens Settings and the live theme picker.
- `F6` searches the workspace.
- `Ctrl+D` on Windows/Linux or `Cmd+D` on macOS selects the next occurrence
  for multi-cursor editing.

Terminal applications can intercept key combinations. Use the command palette
when a shortcut does not reach the editor.

Select source text and press **Tab** to indent its touched logical lines, or
**Shift+Tab** to dedent. With multiple selections each line changes only once;
an empty caret participates when another selection is nonempty. A selection
ending at the next line's start excludes that next line. With only empty
carets, Tab still inserts normally; Shift+Tab dedents the current lines.
**F1 > Indent lines / Dedent lines** also works at an empty caret.
Selections stay attached to the source and one Undo/Redo restores the whole
operation. Blank lines are not indented. Completion accepts Tab first, and
dialogs and palette fields keep their own handling.
Choose the indentation style, indent width, and tab width from F1; see
buffer indentation for mixed-prefix rules.

With no explicit theme selection, the editor uses Kanagawa Wave dark
(`kanagawa-wave`) on both light and dark terminals. Existing selections remain
unchanged. See Themes and settings for
configuration and session overrides.

Open PNG, JPEG, or GIF files from the tree, Quick Open, or a launch argument to view them in read-only tabs. Kitty and Sixel terminals show the image; other terminals show file details. GIFs display their first frame. Images are limited to 8 MiB and 4 million pixels, with eight image tabs open at once. Ctrl+S never changes image files; F5 refreshes them.

## Find and replace in a buffer

Find defaults to literal, case-insensitive search. Use **Tab** to focus the
query, replacement, **Case sensitive**, **Whole word**, **Regex**,
**In selection**, or actions; **Space/Enter** activates a focused control.
Options last for this editor session. **Enter/F3** finds the next match and
**Shift+Enter/Shift+F3** the previous one; **Esc** returns to source.
The underlined match is separate from your source selection.
Enable **In selection** after selecting source text to capture those ranges.
With no selection it explains what to select instead of searching elsewhere.

**Replace** edits the active match and advances without finding inserted text.
**Replace all** applies the complete snapshot as one undo step.
**Review replacements** shows each match and its replacement preview:
**Y Yes**, **S Skip**, **A All remaining**, **Q Quit** (or Tab/Enter).
Yes is one undo step, All remaining one batch; Quit keeps accepted edits.
Undo/redo restores source and mapped selections. An unrelated source change
stops review; start a new search before continuing.

Whole-word matching treats Unicode letters, marks, digits, and underscore as
word characters: `count` matches `count`, not `counter`. Regex uses Go syntax
with multiline line anchors; dot does not cross LF unless you request `(?s)`.
Lookbehind and query backreferences are unsupported. Literal replacement
inserts text verbatim. Regex replacement accepts `$1`, `${1}`, `${name}`, `$$`,
and `\n`, `\t`, `\\` escapes. For example, query
`(?P<name>[A-Za-z_]+)=([0-9]+)` and replacement `${name}: $2` changes
`total=12` to `total: 12`. Invalid patterns or replacement references show
an error before any edit.

Fields are limited to 4 KiB. Above 10,000 matches the result is explicitly
incomplete and replacement/review is disabled: narrow the query or scope.
Stale results, invalid text, or output exceeding the 1 MiB editing limit
cannot partially modify a buffer. Workspace search remains literal and unchanged.

## Editor groups

Use `Ctrl+\` or F1 > **Split Right** to create another editor group beside
the focused group. `Ctrl+Shift+\` or **Split Down** places it below. Each
group has its own tabs and displays one active document. The tab bar's **+**
opens Quick Open in that group; the next two controls split right and down.

Click a group to focus it, or use **Alt+PgDown / Alt+PgUp**. **Ctrl+Tab /
Ctrl+Shift+Tab** switches tabs within the focused group. In Quick Open,
**Ctrl+Enter** opens a chosen file to the right and **Ctrl+Shift+Enter** opens
below; ordinary Enter opens it in the focused group. The file tree context
menu offers these destinations too.

Drag the divider to resize groups. F1 > **Move tab to next editor group**
transfers the active tab; **Close editor group** closes its tabs with the usual
unsaved-file protection. Splitting the same file shares edits, saves and undo
history while keeping separate caret and scroll positions. Closing the last
tab collapses an empty split group; the final group shows the start page.
See editor groups and tabs for limits.

## Buffer indentation

Use F1 > **Set indentation style** to choose Spaces or Tabs for the active
buffer. **Set indent width** and **Set tab width** show the current value and
accept integers 1–16; an invalid value shows an inline message without changing
anything. Escape cancels. Defaults remain Spaces, indent width 4, tab width 4.
Matching `.editorconfig` files inside the workspace set the buffer's base
values when it opens or its path changes, including new named files. The
palette shows `.editorconfig`, `default`, or `buffer override` as the origin.
**Reload EditorConfig** rereads configuration for the active buffer without
discarding manual choices. No configuration watcher or service is started.

Tab inserts exactly indent-width spaces in Spaces mode, or one literal tab
in Tabs mode, including at multiple carets. Literal tabs display at the next
configured tab stop of the logical source line, including across soft wraps.
Completion keeps priority over indentation when its menu is open.

These choices never convert existing whitespace, dirty the file, or add undo
steps. They survive reload and path changes while the buffer stays open, but
are not saved across close/reopen or restart. **Reset buffer indentation
overrides** restores the resolved file values (or defaults/host base values).
Unreadable or invalid configuration produces one concise warning per
resolution while editing stays available. See Buffer indentation
for geometry and package integration.

## History, previews, and AI context

When Git is available, blame follows the unsaved buffer and file history follows
renames. Browser previews support Markdown, Mermaid, and saved HTML without a
frontend toolchain. Preview only content you trust because HTML can run scripts
on the shared preview origin.

For a saved file without opening the terminal editor, run
`zai-editor preview /absolute/path/document.md`. It opens the browser and prints
the URL; keep the command running while viewing, and stop it with Ctrl+C.
Use `--no-open` before the file for a URL only, or `--root <trusted-directory>`
for parent assets. See `zai-editor preview --help` and
browser previews.

Saved Markdown previews read from disk on browser refresh when opened with F7
from a clean buffer. Unsaved Markdown uses a snapshot; press F7 again to update
it, or after saving to switch back to disk reads.
Saved previews and unsaved snapshots use separate URLs so they cannot replace
each other's content, including when a headless preview is already open.

Inline comments do not modify the file. Ask AI packages your question, captured
code excerpts, comments, and current selection into a bounded request you can
copy to a coding agent.

## Optional language servers

Syntax highlighting works without a language server. Install supported servers
only when you want completion and go-to-definition:

```text
zai-editor lsp install go
zai-editor lsp install typescript python html css json yaml
```

Installed presets remain disabled until you enable them for a trusted workspace
with `--lsp` or **F1 > Enable built-in language servers**. See
[LSP setup](?id=zai-editor&doc=docs--lsp-setup) and the
language support matrix for prerequisites, exact
coverage, and limitations.

## Scope and safety

zai-editor is a focused UTF-8 text editor rather than a full IDE or large-file
viewer. Files must be no larger than 1 MiB, use consistent LF or CRLF line
endings, and contain no NUL bytes. Saves detect external changes and refuse
conflicts instead of overwriting them silently.

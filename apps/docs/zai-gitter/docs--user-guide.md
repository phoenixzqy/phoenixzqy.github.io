# User guide

This guide covers installing, running, and using the standalone `zai-gitter`
app. For embedding the viewer or producing archives, see
packages and distribution.

## Install and run

macOS / Linux:

```bash
curl -fsSL https://phoenixzqy.github.io/install/zai-gitter.sh | sh
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/install/zai-gitter.ps1 | iex
```

The installer downloads the package for your platform and architecture,
verifies its SHA-256, installs the executable under your home directory, and
updates the Windows user `PATH` or common macOS/Linux shell profiles. The
macOS/Linux installer needs Python 3, `curl` or `wget`, `sha256sum` or `shasum`,
and a ZIP extractor such as `unzip`, `bsdtar`, `tar`, or Python. Open a new
terminal, then run `zai-gitter [--theme <theme>] [directory]` from any Git
workspace. Git must already be on `PATH`; after installation, the app does not
need Python, Go, Node.js, zai, or a forge account.

If your shell does not load `.profile`, `.bashrc`, or `.zshrc`, add the
installation directory (normally `~/.zai`) to that shell's PATH yourself.

Standalone use requires Git and a local working tree, not a forge remote,
zai config, or coding agent. Redirected output produces one 100x30 plaintext
frame and exits. Interactive use retains working-tree/history review, comments,
OSC 52 export, and the explicit F1 Git command palette with destructive-action
confirmations, and F2 Settings (see [Themes and settings](#themes-and-settings)).


## Uninstall and remove local data

Close zai apps and stop services before uninstalling. These commands delete `zai-gitter` and its app-owned local data, including edited settings and saved runtime/session data. Python 3.10+ is required.

macOS / Linux:

```sh
curl --proto '=https' --proto-redir '=https' -fsSL https://phoenixzqy.github.io/uninstall/zai-gitter.sh | sh
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/uninstall/zai-gitter.ps1 | iex
```

From a source checkout, run `python scripts/uninstall.py`, `sh scripts/uninstall.sh`, or `& ./scripts/uninstall.ps1`. All three contain the same standalone cleanup implementation and do not fetch more code. Preview with `python scripts/uninstall.py --dry-run`; pass `--install-dir /absolute/install/directory` for a custom installation.

For hosted commands, set `ZAI_UNINSTALL_DRY_RUN=1` to preview or `ZAI_INSTALL_DIR` to select the absolute install directory before running the command. Shared theme cleanup respects `ZAI_THEME_CONFIG`. Custom locations must be supplied again if they differ from their defaults.

The uninstaller removes this app’s executable, licenses, app settings, and local data. It preserves sibling applications, Git worktrees, project files, independently installed coding agents and their normal homes, and unrelated files. The shared install directory remains on PATH while another executable needs it. Otherwise it removes the installer’s exact PATH lines from common shell profiles or the matching Windows user PATH entry. Manually authored shell PATH configuration remains yours to update. Open a new terminal afterwards; a piped shell script cannot change its parent shell’s environment. Failures report the affected path and return nonzero; correct the problem and rerun. A recovery marker remains after partial cleanup. The shared `releases/install.lock` is retained to coordinate future installations without replacing a lock another installer may hold.

## Review scope

The viewer covers read-only working-tree and commit-history review,
inline/side-by-side diffs, file selection, navigation, comments/drafts, and
contextual Ask AI export. Background review does not mutate the index or
working tree. Explicit Git command-palette actions retain validation,
destructive-action confirmation, and cancellation; no agent launches
automatically.

The standalone app and the package consumed by zai share one viewer and
reader implementation. zai owns workspace selection and explicit delivery
to its live agent panes. Standalone Ask AI exports for the user to copy; it
does not claim delivery.

### Image previews

PNG, JPEG and GIF changes show labeled Before and After previews through the shared design-system image viewer. GIF previews use the first frame. Added files show After, deleted files show Before, and modified or renamed files show both images from the selected comparison. Full-file mode keeps this comparison, including immutable Git history rather than the current working file.

Symlinks retain their target-path text diff even when their names have image suffixes. Comparisons that change between a symlink and a regular file also remain text diffs; previews never substitute the linked image for the link's own content.

Kitty and Sixel terminals draw images when capability detection succeeds. The zai host owns graphics for hosted tabs, splits and Diff Review; older hosts and unsupported or ASCII terminals retain format, dimensions and an explicit fallback notice. Partially visible image viewports and overlays withdraw the image, and narrow or short panes preserve readable fallback text. At most two fully visible images are placed at once.

Image reads never access the network or use Git external diff/textconv. Working files stay confined to the workspace; Git images come from bounded read-only blob reads. A scope retains at most eight images, 8 MiB source bytes and 4 million pixels in aggregate. Malformed, unsupported or oversized files show a notice; selecting a smaller folder or file resolves scope-budget notices.

Canceling a read or reaching its 30-second deadline stops the entire patch load rather than publishing an image-error patch.

### Change totals

The diff header shows green added-line and red deleted-line totals for the
selected workspace, folder, or file before a compact distribution indicator
where space permits (for example, `+1638 -111 [++++-]`). Totals describe net
working-tree changes against HEAD (including staged and untracked files), or a
selected commit against its first parent. Full-file previews count only changed
lines. Clean scopes show `+0 -0`; loading, failed, or incomplete previews omit
totals rather than presenting an uncertain count.

### Inline and side-by-side layout

Diffs start inline until the viewer has a size. The viewer automatically
switches to side-by-side at 200 usable diff columns or more (viewer width minus
the file sidebar and two separators), and back to inline below that width.
Known source file types use syntax colors from the active theme in diffs and
full-file previews, including both sides of split diffs. Change backgrounds,
selection colors, and line-number gutters remain distinct; unknown file types
and previews over 128 KiB render without syntax coloring. Multi-file previews
color at most 1 MiB of source text in total.
The `automaticSplitWidth` policy lives in the reusable viewer. The default
28-column sidebar makes a 230-column viewer side-by-side. Resizing the viewer
or its sidebar updates the layout; `i` (Inline) and `s` (Split) override
automatic selection for the lifetime of that viewer.

### Comments and Ask AI

Saved inline comments use the theme's accent color when inactive and primary
color when active, distinct from unchanged code, and wrap their body text at
word boundaries. Ask AI exports your question, saved comments with their
original file/range/revision and selected line contents, and the active code
selection if present. Included repository excerpts are marked as untrusted
data, not instructions; file changes require an explicit request in the
question. It adds no predefined review instruction, uncommented files, whole
patches, or implicit cursor-line context. Split selections include only the
selected side; inline selections keep both old/new line numbers.

Saved source excerpts are capped at 2,000 bytes per comment (excluding its
file/range/revision metadata) and current-selection context at 16,000 bytes,
with `[excerpt]` marking omitted content. When source is included, the request
explicitly identifies repository-derived content as untrusted data, not
instructions. Refresh retains captured comment context and marks potentially
stale anchors rather than replacing their content.

## Keys and controls

Shared editor shortcuts are `Ctrl+Q` to quit, `Ctrl+C` to copy selected code,
`F5` to refresh, and `F1` or `Ctrl+Shift+P` to open commands. `q` does not
quit the app; `Ctrl+C` still cancels an open Git command palette. Quit remains
available with `Ctrl+Q` in dialogs and editors. `r`, `y`, and `Ctrl+Y` remain
refresh/copy aliases. Git-specific actions such as `f` (Full file), `i`/`s`
(Inline/Split), `c` (Comment), `a` (Ask AI), `w` (Word wrap), and `t` (cycle
auto/dark/light theme mode) keep their bindings.

Function-key controls appear in the footer as `F1 Commands`, then
`F2 Settings` when this app owns settings, then `F5 Refresh`. Contextual
actions and navigation appear in the header as matching bracketed controls,
without dot separators. Header controls wrap in narrow
panes; footer controls omit lower-priority actions to keep Quit visible when
it fits. Short panes omit header controls that would cover the diff or footer.
The reusable viewer only exposes Settings when its host enables it;
quitting the standalone app never becomes a process-exit action in an embedded
viewer.

### Command palette and graph

The command palette's search field is caret-aware: Left/Right, Home/End,
Ctrl+E, and word-wise Ctrl+Left/Ctrl+Right move the caret; Backspace, Delete,
Ctrl+K, and Ctrl+W edit around it; and typing or pasting inserts at the caret,
about 512 characters. Ctrl+A and Ctrl+U still clear the whole field.

Search for `Git: Graph` in that palette to view the all-ref branch/merge graph
inside the viewer without changing the checkout. The graph shows abbreviated
hashes, dates, authors, ref decorations, and subjects in Git date order. Use
Up/Down or PgUp/PgDn to move vertically, Left/Right to scroll long lines
horizontally, and `q` or Esc to close only the graph. Graph reads are
cancellable and limited to 500 commits, 1 MiB of output, and 15 seconds;
partial results and failures are labeled.

## Branches panel

The left sidebar places a searchable local **Branches** panel between Files and
Commits. Locally known default and current branches appear first (without
duplicates), then other local branches by name, including within search
results. The default comes from local remote-HEAD metadata; absent or ambiguous
metadata never guesses a branch. Tab/Shift+Tab moves focus; `/` in Branches
opens its filter, Ctrl+U or the filter's `[x]` clears it, and Escape returns to
the list. `>` marks the navigation cursor and `*` the checked-out branch in
separate columns. The checked-out branch remains emphasized when the cursor or
focus moves away.

Enter on a selected branch or a double-click on the same row switches it
through the guarded Git checkout path, never by filtering, single-clicking, or
after an intervening click elsewhere. A conflicting change or another
worktree's checkout fails visibly without forcing or discarding edits, and an
attempt that leaves the checkout unchanged preserves the selected commit,
full-file review, drafts, and comment anchors.

Drag the Branches or Commits panel's top border to redistribute height with
the section above it; preferences last for the viewer lifetime. Small
terminals use a compact non-overlapping layout.

## Commits panel

In Commits, `*` marks the displayed Working tree or historical commit,
independently of the cursor; a commit outside the loaded history window marks
no row.

The **Commits** panel has the same filter controls as Branches: focus it and
press `/`, or click its search row, to match commit subjects or hashes
(case-insensitive substring matching). Backspace edits, Ctrl+U or `[x]` clears,
and Escape, Enter, or Tab returns to the list without selecting a revision. The
filter only searches the loaded history (latest 100 commits reachable from
HEAD); it does not fetch more history or run Git. Working tree remains
available, and no matches are labeled explicitly. Filtering keeps the displayed
diff, comments, and drafts unchanged; Enter on a list row or clicking a commit
selects that revision. Branch and commit queries are independent.

### Copying SHAs and opening commit links

Commit IDs are underlined in the theme's link-like primary color (selection
text color while focused). With Commits focused, `Ctrl+C`, `y`, `Ctrl+Y`, or
the `[Ctrl+C Copy SHA]` control copies the cursor's **full commit SHA** via
OSC 52, without selecting its diff. Working tree has no commit SHA to copy.
Plain click or Enter still selects the commit diff. **Ctrl+click only on the
commit ID** opens its web page in the default browser without changing the
diff, selection, or focus; subjects and panel borders are not links.

This requires the terminal to forward Ctrl+click mouse events. URL lookup reads
`origin` only on demand and supports GitHub.com, GitLab.com, Bitbucket.org and
Azure Repos (`dev.azure.com`/`ssh.dev.azure.com`) remotes in HTTPS, HTTP, SSH
(including scp-style), or `git://` form. It always opens an `https` link and
never contacts the forge itself. Missing, custom-host, or unsupported remotes and
browser-launch failures produce a notice; viewing and SHA copy remain
available. Link styling is rendered by the viewer, not an OSC 8 terminal
hyperlink, so terminal-specific hyperlink gestures cannot override ordinary
diff clicks.

Under WSL, commit links open in the Windows default browser through
`powershell.exe` interop, with `wslview` as a fallback; no Linux GUI browser
or localhost forwarding is needed. Enable Windows interop or install `wslview`
if the link cannot open. The notice identifies launcher failures.

## Themes and settings

The viewer uses Kanagawa Wave dark (`kanagawa-wave`) by default, on both light
and dark terminals. Every cell is painted with
the theme's own background and foreground, so light themes look right on dark
terminals and vice versa. Press F2 or click `[F2 Settings]` next to
`[F1 Commands]` in the footer to open Settings and choose any theme from the
shared catalog. The highlighted theme previews live; Enter saves it and Reset
to default returns to Kanagawa Wave dark. Choices are saved in the shared zai
theme file (`~/.zai/theme.json`, or `$ZAI_THEME_CONFIG`) under
`apps.zai-gitter`, and a running viewer applies changes to that file live,
including changes made from zai's Settings page. The `t` toggle's forced dark
and light modes use the configured theme when it suits that background, and
a configured family's matching variant (for example `catppuccin` gives
catppuccin-mocha and catppuccin-latte); forced light falls back to
onedark-light when the selected theme has no light variant.

When a host launches git-diff tabs with `ZAI_SETTINGS_HOST=zai`, the host owns
settings: the footer has no `[F2 Settings]` and F2 directs users to zai's
Settings page. The viewer still follows the shared file, so zai's **Git viewer
theme** row (saved under `apps.zai-gitter`) restyles it live. Without that
environment setting, the standalone viewer offers its own Settings dialog.
zai's native Diff Review rail embeds the viewer without a settings control.

`--theme <name>` (a theme or a family such as `catppuccin`) and `$ZAI_THEME`
override the file for one session. `--theme dark` or `light` assumes that
background instead of following the terminal; without a selected theme,
Kanagawa Wave remains dark, while selected families use that background's
variant. `--theme auto` is the default.
An invalid theme file never stops the viewer: it reports the problem and
keeps the last good themes. Redirected output keeps its fixed plain frame.

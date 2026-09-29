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

If your shell does not load `.profile`, `.bashrc`, or `.zshrc`, add the
installation directory (normally `~/.zai`) to that shell's PATH yourself.

The packages are unsigned. macOS may quarantine the download, and Windows
SmartScreen may warn about it. Follow your device and organization security
policies rather than disabling them.

## Everyday controls

- `Ctrl+P` opens Quick Open.
- `Ctrl+F` finds text in the current buffer.
- `Ctrl+S` saves.
- `Ctrl+Shift+P` or `F1` opens the command palette.
- `F2` opens Settings and the live theme picker.
- `F6` searches the workspace.
- `Ctrl+D` on Windows/Linux or `Cmd+D` on macOS selects the next occurrence
  for multi-cursor editing.

Terminal applications can intercept key combinations. Use the command palette
when a shortcut does not reach the editor.

## History, previews, and AI context

When Git is available, blame follows the unsaved buffer and file history follows
renames. Browser previews support Markdown, Mermaid, and saved HTML without a
frontend toolchain. Preview only content you trust because HTML can run scripts
on the shared preview origin.

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

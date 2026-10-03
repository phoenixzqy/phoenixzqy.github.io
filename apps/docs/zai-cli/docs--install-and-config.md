# Install and configure zai

## Prerequisites

Installing a pre-built release requires **Python 3.10 or newer** on PATH. On macOS/Linux, the command below also needs `curl`; the bootstrap supports `curl` or `wget` when run from a downloaded file, and `sha256sum` or `shasum` for checksum verification. ZIP extraction uses `unzip`, `bsdtar`, a ZIP-capable `tar`, or the selected Python interpreter. No source checkout, Go toolchain, GitHub sign-in, or coding-agent CLI is needed to install the package.

The bootstrap checks that Python runs and meets the minimum version before downloading the release. It tries `python3`, then `python` on macOS/Linux; on Windows it tries `py -3`, `python`, then `python3`. If none works, install [Python](https://www.python.org/downloads/), enable its PATH option on Windows, open a new terminal, and rerun the installer.

Git and an authenticated coding-agent CLI are needed for repository sessions and services. Node.js/npm is needed for npm-distributed coding agents and automatic provisioning of supported providers; the zai package installer does not install coding agents. Provider authentication is separate from installing zai. See [getting started](?id=zai-cli&doc=docs--getting-started#installation), [Claude Code](?id=zai-cli&doc=docs--claude-code), and [OpenCode](?id=zai-cli&doc=docs--opencode) for provider requirements.

## Install the public release

macOS / Linux:

```bash
(installer=$(mktemp) || exit; trap 'rm -f -- "$installer"' EXIT; curl --proto '=https' --proto-redir '=https' -fsSL https://phoenixzqy.github.io/install/zai-cli.sh -o "$installer" && sh "$installer")
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/install/zai-cli.ps1 | iex
```

The bootstrap reads the public release manifest over anonymous HTTPS, verifies the archive's SHA-256, and runs **`install.py` from the archive root**. That Python entry point and its bundled installer modules create `~/.zai`, install the public `zai`, `zai-editor`, and `zai-gitter` commands, `zai-hook`, and the packaged `.copilot` home, and update persistent user PATH. Downloads are removed on success or failure. `ZAI_INSTALL_DIR` selects another destination.

Open a new terminal after installation, then verify:

```text
zai version
zai doc
zai -h
```

Use `zai <command> -h` for the flags supported by your installed version. The installed CLI documentation is the source of truth for commands, configuration fields, defaults, and workflows.

### If installation fails or `~/.zai` is missing

The folder is created by the bundled Python installer, not by downloading or extracting the archive. Missing or unsupported Python, a failed download or checksum, or a malformed archive can stop the bootstrap before that step. Read the terminal's error message, correct the reported problem, and rerun the installer; creating an empty `.zai` folder does not install the application.

For a manual installation, download the archive for your platform from the [releases page](https://phoenixzqy.github.io/apps/releases/?id=zai-cli), verify its published SHA-256, and extract the entire archive. From its root, run `python3 install.py` on macOS/Linux or `py -3 install.py` on Windows, using a Python 3.10+ interpreter. Keep the adjacent `_installer.py` and other bundled modules together. Directory creation or write failures name the affected path; choose a writable destination with `--install-dir` when needed.

If installation succeeded but `zai` is not found, open a new terminal for the persistent PATH change, or run the executable by its full path (`~/.zai/zai` on macOS/Linux, `%USERPROFILE%\.zai\zai.exe` on Windows). Check `ZAI_INSTALL_DIR` if the default folder is absent.

## Configure each repository

From inside a local checkout with a supported GitHub or Azure DevOps remote, run:

```text
zai config show
zai config path
```

`config show` creates missing default settings and reports `initialized=true` and the detected repository identity. `config path` locates the active profile's file without creating one. Configuration lives under `~/.zai/configs/`, outside the checkout. Existing settings and active profile choices are preserved; invalid files and missing selected named profiles remain errors to repair.

Review or edit the file reported by `config path`, or use `zai config update` for the interactive editor. Preserve its repository identity and existing settings. The output of `config show` is a report, not a configuration file; do not write it back as JSON. Read the "Onboard a repository without the interactive editor" section of `zai doc` for the current schema and model choices.

Verify any edits with `zai config show`, then start the repository's services:

```text
zai start all
```

Run `zai` to open the console. Repeat configuration from each repository you want to use. For ongoing usage, consult `zai doc`, `zai config -h`, and the [configuration reference](?id=zai-cli&doc=docs--config).

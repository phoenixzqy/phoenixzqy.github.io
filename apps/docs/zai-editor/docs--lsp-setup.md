# Set up code completion

Install only the language servers you need. These commands are identical in
PowerShell on Windows and in shells on macOS/Linux:

```text
zai-editor lsp install go
zai-editor lsp install typescript
zai-editor lsp install python html css json yaml
```

Restart the editor with `--lsp` in a trusted workspace, or use F1 > Enable
built-in language servers for this session. Open a source file and type an
identifier or `.`. Suggestions
appear after 250 ms without further typing. Ctrl+Space (or F1 > Complete code)
requests suggestions immediately. Up/Down selects; Tab/Enter accepts; Escape
dismisses. F12 goes to a definition.

The command downloads the selected server and configures its executable paths.
No JSON editing, global npm installation, PATH modification, or administrator
privileges are required. On Windows it launches npm-based servers through Node
directly, not `.cmd` or PowerShell shims.

**F1 > Install LSP servers** shows the same command for each supported language.
Select the entry and press Ctrl+C to copy just its install command, then paste it
into a terminal. Viewing this page never installs or starts anything.

## Prerequisites

Install the runtime first and make it available on the PATH used to launch the
editor. The installer reports missing or incompatible tools; it does not install
SDKs, modify your project, or choose a runtime manager.

| Installer | Required tools |
| --- | --- |
| `go` | [Go 1.26 or newer](https://go.dev/dl/); installs gopls v0.23.0. Go must also remain available when the editor starts gopls. |
| All other supported installers | [Node.js with npm](https://nodejs.org/en/download); Node.js 24 LTS is recommended. The TypeScript server requires Node 22.22.2 or newer. A standard Node/npm distribution must expose `npm-cli.js` through npm's symlink or beside Node/npm. |

Python environments, Elm, framework packages, type declarations, build tools and
project SDKs are separate prerequisites for project-aware results. Installing a
language server alone does not install React dependencies, Python interpreters,
Android SDKs, or other project tooling.

## Supported one-command installers

`zai-editor lsp list` lists every catalog ID and whether it has an installer.
Multiple IDs can be passed to one `install` command.

| ID | Coverage | Pinned direct packages |
| --- | --- | --- |
| `go` | Go | gopls v0.23.0 |
| `typescript` | JavaScript, TypeScript, JSX/TSX, React, React Native | typescript-language-server 6.0.0, TypeScript 6.0.3 |
| `python` | Python, including ordinary Django/Flask/FastAPI source | pyright 1.1.414 |
| `html`, `css`, `json` | HTML, CSS/SCSS/Less, JSON/JSONC | vscode-langservers-extracted 4.10.0 |
| `yaml` | YAML, schema-backed configuration | yaml-language-server 1.24.0 |
| `bash` | Bash/shell scripts, not PowerShell | bash-language-server 5.8.1 |
| `docker` | Dockerfile/Containerfile | dockerfile-language-server-nodejs 0.15.0 |
| `svelte` | Svelte/SvelteKit | svelte-language-server 0.18.4, TypeScript 6.0.3 |
| `astro` | Astro | @astrojs/language-server 2.17.0, TypeScript 6.0.3; SDK path configured automatically |
| `elm` | Elm | @elm-tooling/elm-language-server 2.8.0 |
| `php` | PHP | intelephense 1.18.5; review its license and paid feature tiers |

Direct packages are pinned by the editor. npm resolves their transitive
dependencies at installation time and retains its lockfile in the installation;
this is not a claim of a fully locked cross-machine dependency graph.
npm lifecycle scripts are disabled. Project-level tooling that a server expects
must be installed separately rather than relying on a package postinstall script.

**Manual-only catalog entries:** Rust, C/C++/Objective-C (clangd), Java, Kotlin,
C#, Dart/Flutter, Swift, Ruby, Elixir, Lua, Zig, Haskell, OCaml, Clojure, TOML,
Terraform, Markdown, LaTeX/BibTeX and Nix. `lsp list` supplies their upstream setup
links, and F1 displays their manual instructions. Asking `lsp install` for these
IDs fails explicitly; there is no pretend-success fallback. Their SDK/platform
requirements differ, and some cannot run on every OS (for example iOS tooling
requires macOS/Xcode). See the coverage matrix.

## Storage, configuration and disabling

The default server home is `~/.zai-editor/lsp`, using your operating system's user
home. `ZAI_EDITOR_LSP_HOME` selects a different **absolute** directory for an
isolated installation. Use the same value for installing and launching.

The installer runs in a private staging directory, never your workspace. It
stores server files under `servers/<id>/<recipe-key>`, npm's cache under `cache`,
and the generated per-server launch records under `installed`. Those records
contain absolute paths to the installed executable or Node and JavaScript entry
point. Moving the directory or replacing a runtime at a different path requires
rerunning the install command. It does not rewrite a supplied `--lsp-config`.

Precedence is: explicit `--lsp-config` (or `ZAI_EDITOR_LSP_CONFIG`) entries,
then managed installations, then installed-on-PATH catalog presets. All presets
are disabled by default in the executable. In a trusted workspace, pass `--lsp`
or use F1 > Enable built-in language servers for this session. Installing servers
does not authorize them in other workspaces. `--lsp=false` or F1 > Disable
built-in language servers disables both managed and PATH presets.
Explicit user configuration remains enabled. Embedded hosts retain their own
opt-in and must explicitly load managed presets if desired.

Re-running a command reuses its pinned files and refreshes the launch record.
New recipe versions retain previous server directories so active editors are
not disturbed. Remove unused versions only after closing editors using them.
An interrupted or failed install leaves the previous launch configuration
unchanged. For multi-server commands, earlier successes remain installed and the
command stops at the first failure.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `go`, `node`, or `npm` is required | Install the runtime above, reopen the terminal, and retry. Check `go version`, `node --version`, and `npm --version`. |
| Unsupported Node/Go version | Upgrade the runtime; npm engine requirements and Go's local-toolchain check are enforced. The installer will not silently download another Go toolchain. |
| Cannot locate `npm-cli.js` | Use a standard Node/npm distribution. Custom wrappers that hide the actual npm installation are not executed through a shell. |
| Download/proxy/registry error | Check your package manager's configured approved registry/proxy and retry. The installer streams errors and exits nonzero; do not put credentials in commands or editor configuration. |
| No completion after installation | Restart the editor with the same `ZAI_EDITOR_LSP_HOME`; opt in with `--lsp` or F1 in a trusted workspace. Check the status line after Ctrl+Space, the file type, runtime PATH and project dependencies. Unsupported completion snippets are not inserted. |
| `.install.lock` exists | Another install may be running. After a crash, verify that it has stopped before removing that exact lock file and retrying. Never delete an active installer's lock. |
| Incomplete installation directory | Close editors using it, move the specifically reported directory aside, and rerun install. Existing user configuration is not silently discarded. |
| Your language is manual-only | Follow its upstream link from `lsp list`, then use PATH or an explicit configuration. |

Ctrl+C cancels the command and its owned process tree. An installation is limited
to 15 minutes per server. No automatic downloads occur while editing, and no
unrelated servers start. Installing or enabling a server does not sandbox it:
servers receive your source, may access the network, and can execute project
tooling. Use trusted packages, approved registries and trusted workspaces.

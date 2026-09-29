# Built-in language and framework integrations

The editor ships the **presets and LSP client**, not server binaries, SDKs, or
project dependencies. The catalog is always available in **F1 > Install LSP
servers**. The executable disables installed presets by default. In a trusted
workspace, pass `--lsp` or choose **F1 > Enable built-in language servers** to
start matching servers on demand. Installing servers does not enable them in
other workspaces. Use
`--lsp=false` or **F1 > Disable built-in language servers** to disable presets;
**F1 > Enable built-in language servers** re-enables them for the session.
Editing never installs servers. Use `zai-editor lsp install <server>` explicitly
for the supported installers in the [setup guide](?id=zai-editor&doc=docs--lsp-setup). Embedded `tui/editor.New` models keep
built-ins disabled until their host calls `SetBuiltinLanguageServers(true)`.

Typing an identifier or `.` requests suggestions after 250 ms without further
input. **Ctrl+Space**, or **F1 > Complete code** when the terminal reserves that
key, requests them explicitly. Up/Down selects, Tab/Enter accepts, and Escape
dismisses. F12 navigates to a definition. Acceptance, including additional
import edits, is one undoable change; it never saves the file.

## Coverage matrix

These are built-in launch presets, **not a certification that every server
release or framework feature works**. Language/framework names below describe
the scope of each server; missing SDKs, dependencies, type declarations and
build configuration can prevent project-aware results. The server column links
to upstream installation and compatibility guidance. Basic protocol behavior is
tested with deterministic servers; native platform and real-server evidence is
recorded separately in each integration PR.

| Preset | Languages / frameworks | File selectors | Server / prerequisites and limits |
| --- | --- | --- | --- |
| typescript | JavaScript, TypeScript; **React, React Native, Next.js**, Node.js, Express, NestJS; Angular TS code | `.js .mjs .cjs .jsx .ts .mts .cts .tsx` | [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) and TypeScript. React uses `javascriptreact`/`typescriptreact`; install project typings. Framework code is covered through JS/TS types, not framework-specific templates or native mobile SDK code. |
| html | HTML | `.html .htm` | [vscode-html-language-server](https://github.com/hrsh7th/vscode-langservers-extracted); no Angular/Django template semantics. |
| css | CSS, SCSS, Less, CSS modules | `.css .scss .less` | [vscode-css-language-server](https://github.com/hrsh7th/vscode-langservers-extracted); CSS modules have ordinary stylesheet support, not JS cross-file symbol integration. |
| json | JSON, JSONC | `.json .jsonc` | [vscode-json-language-server](https://github.com/hrsh7th/vscode-langservers-extracted); schema support depends on server configuration. |
| svelte | Svelte, SvelteKit | `.svelte` | [svelteserver](https://github.com/sveltejs/language-tools); project dependencies required. |
| astro | Astro | `.astro` | [astro-ls](https://github.com/withastro/language-tools); TypeScript SDK required; some releases require an explicit `initializationOptions.typescript.tsdk`. |
| go | Go | `.go` | [gopls](https://go.dev/gopls/), Go toolchain and module dependencies. |
| python | Python, Django, Flask, FastAPI | `.py .pyi` | [pyright-langserver](https://github.com/microsoft/pyright); configure Python environment. Python code only; not Django/Jinja templates. |
| rust | Rust | `.rs` | [rust-analyzer](https://rust-analyzer.github.io/); compatible Rust toolchain. |
| clang | C, C++, Objective-C, Objective-C++ | `.c .h .cc .cpp .cxx .hh .hpp .hxx .m .mm` | [clangd](https://clangd.llvm.org/); compilation database recommended. `.h` defaults to C; override for C++. `.m` defaults to Objective-C, not MATLAB. |
| java | Java, Spring, Android Java | `.java` | [jdtls](https://github.com/eclipse-jdtls/eclipse.jdt.ls) launcher, compatible JDK and project build dependencies. Use an instance-private server data directory if the launcher requires one. Android IDE parity is not promised. |
| kotlin | Kotlin, Android Kotlin | `.kt .kts` | [fwcd kotlin-language-server](https://github.com/fwcd/kotlin-language-server), compatible JDK. Community-server coverage; not a claim of full Android/Compose or JetBrains IDE support. |
| csharp | C#, ASP.NET, Unity | `.cs` | [csharp-ls](https://github.com/razzmatazz/csharp-language-server), compatible .NET SDK and project files. No Razor or Unity-specific editor integration. |
| dart | Dart, Flutter | `.dart` | [Dart language server](https://dart.dev/tools/lsp), Dart/Flutter SDK on PATH and project dependencies. |
| swift | Swift, SwiftUI, iOS | `.swift` | [sourcekit-lsp](https://github.com/swiftlang/sourcekit-lsp), Swift toolchain; iOS needs macOS/Xcode and compatible build-system integration. |
| ruby | Ruby, Rails | `.rb .rake .gemspec` | [ruby-lsp](https://github.com/Shopify/ruby-lsp); Ruby environment and optional Rails add-ons. No ERB templates. |
| php | PHP, Laravel, Symfony | `.php .phtml` | [intelephense](https://github.com/bmewburn/intelephense-docs); review its license and feature tiers. No Blade/Twig templates. |
| elixir | Elixir, Phoenix | `.ex .exs` | [ElixirLS](https://github.com/elixir-lsp/elixir-ls), Erlang/Elixir toolchain. Provide an `elixir-ls` stdio launcher or override its distribution-specific executable. |
| lua | Lua | `.lua` | [lua-language-server](https://github.com/LuaLS/lua-language-server). |
| zig | Zig | `.zig` | [zls](https://github.com/zigtools/zls), compatible Zig version. |
| haskell | Haskell | `.hs .lhs` | [haskell-language-server-wrapper](https://haskell-language-server.readthedocs.io/), compatible GHC. |
| ocaml | OCaml | `.ml .mli` | [ocamllsp](https://github.com/ocaml/ocaml-lsp) in the selected opam environment. |
| clojure | Clojure, ClojureScript, EDN | `.clj .cljs .cljc .edn` | [clojure-lsp](https://clojure-lsp.io/). |
| elm | Elm | `.elm` | [elm-language-server](https://github.com/elm-tooling/elm-language-server), Elm toolchain. |
| bash | Bash / shell scripts | `.sh .bash` | [bash-language-server](https://github.com/bash-lsp/bash-language-server); not PowerShell or Fish. |
| yaml | YAML; Kubernetes / CI files through schemas | `.yaml .yml` | [yaml-language-server](https://github.com/redhat-developer/yaml-language-server); appropriate schemas needed, not inferred product-specific defaults. |
| toml | TOML | `.toml` | [taplo](https://taplo.tamasfe.dev/) with LSP support. |
| terraform | Terraform, OpenTofu-compatible projects | `.tf .tfvars` | [terraform-ls](https://github.com/hashicorp/terraform-ls); provider initialization/toolchain compatibility required; OpenTofu support depends on the server release. |
| docker | Dockerfile / Containerfile | `Dockerfile`, `Containerfile`, and dot-suffixed variants | [docker-langserver](https://github.com/rcjsuen/dockerfile-language-server); Dockerfile syntax support, not image builds. |
| markdown | Markdown | `.md .markdown` | [marksman](https://github.com/artempyanykh/marksman); Markdown links, not embedded-language or AI prose completion. |
| tex | LaTeX, BibTeX | `.tex .bib` | [texlab](https://github.com/latex-lsp/texlab); compiling needs a separate TeX distribution. |
| nix | Nix | `.nix` | [nil](https://github.com/oxalica/nil), primarily Unix toolchains. |

### Explicitly not integrated by default

**Vue/Nuxt single-file components** need a compatible Vue/TypeScript plugin
bridge: current Vue server versions use custom `tsserver/request` and
`tsserver/response` notifications. Listing a `vue-language-server` command alone
would incorrectly promise working TypeScript completion in `.vue` files.
**Angular templates**, Tailwind class completion, GraphQL embedded documents,
SQL dialects, Razor, Blade/Twig/ERB/Jinja templates, PowerShell, and other
framework-specific surfaces are not built-in integrations. Their ordinary
JS/TS/Python/etc. source files still use the language presets above. Custom
standard-LSP servers can be configured, but proprietary client extensions or
multiple cooperating servers are not automatically supported.

## Configuration and platform requirements

`--lsp-config <file>` (or `ZAI_EDITOR_LSP_CONFIG`) accepts a user-owned JSON
object. Explicit entries override managed installations and PATH presets, and remain enabled even with
`--lsp=false`. Selectors are lowercase extensions or exact filenames, with a
maximum of 128 entries. For example:

```json
{
  ".tsx": {
    "languageId": "typescriptreact",
    "command": ["typescript-language-server", "--stdio"],
    "installInstructions": "Install TypeScript and typescript-language-server using approved tooling."
  }
}
```

`initializationOptions` optionally supplies server-specific JSON. Restart after
changing a config. No workspace configuration, dependency directory, manifest
script, or installation recipe is automatically executed. Detection uses only
the requested file's extension/name, not recursive scans or guessed framework
dependencies. Mixed-language projects start only the servers actually requested.

Commands are argument arrays, not shell strings. Manually configured executables must be on the
trusted launcher PATH or specified by absolute path. The editor does not run
`npx` or package managers. On Windows, npm `.cmd` shims and PowerShell scripts
are not native executables: the managed installer configures `node` and the
JavaScript entry point automatically. For manual setups, override the command with `node` and the absolute
path of the installed server's JavaScript entry point. Likewise, configure
runtime-plus-script arguments for distribution-specific launchers. Installation
paths vary; unmanaged presets do not guess them.

Servers use local stdio; network access is not required by LSP itself. Servers
may independently download schemas, dependencies or toolchains. They receive
workspace paths and requested document contents, including unsaved edits, and
may execute project tooling. Open only trusted workspaces with LSP enabled.
Missing executables report an error on the first request and stop automatic
retries; review **F1 > Install LSP servers**, install the server using approved
tooling, then use **Ctrl+Space** to retry. For Go, both `gopls` and the Go
toolchain must be available to the editor's process.

## Ownership and resource bounds

No server starts merely because the editor or catalog opens. The first
completion/definition request starts the matching installed server; no warm-up
of unrelated languages occurs. Compatible file variants share one server
inside the same model. Each model owns its processes and context: there is no
global process pool, PID-by-name lookup, or cross-editor shutdown.

Closing one standalone editor or disposing one embedded model with `Model.Close`
stops only its owned process groups/jobs, including ordinary descendants.
Another editor, even for the same workspace/language, keeps its own processes.
Closing a file tab or hiding a host rail is not model teardown. Servers remain
available for reopening files until that model closes. Force-killing the parent
or deliberately detached server children is outside normal graceful teardown
guarantees.

There are at most eight retained server configurations per model, one in-flight
LSP operation and one coalesced completion request. Typing cancels the pending
debounce; obsolete in-flight results cannot change the document or reopen a
dismissed menu. In-flight requests have a 10-second deadline, rather than
restarting a language server on every keystroke. No completion polling or idle
timer runs. A server that fails to start or to answer stops automatic retries;
explicit completion retries after setup. A manual request made while another
operation is in flight is queued and served once that operation finishes.
F12 definition requests made during completion are likewise queued for the
original document and caret; if the tab, document, or caret changes before the
request runs, the queued definition is discarded instead of navigating elsewhere.
Automatic background queries with no result leave the status line unchanged.
External servers' own CPU/RAM/indexing costs are not controlled by the editor.

Completion transport messages are limited to 4 MiB and the menu to 100 items.
Plain text, insert/replace ranges, and resolved additional edits are supported.
Unsupported snippets/commands, malformed items and overflow items are counted in
status rather than inserted literally or executed; the remaining valid items are
still offered and the server stays available. A response that cannot be
interpreted at all pauses automatic retries without terminating the server;
Ctrl+Space retries and reports the response error. Malformed or
overlapping edits are refused without changing the buffer. Diagnostics, hover,
formatting, snippet tabstops, completion commands, multi-server overlays and
project-wide synchronization of all unsaved buffers are not implemented.

## Maintaining this matrix

Update this document and `editor/lsp/catalog.go` together when adding/removing
presets or changing detection. Keep React and other framework names explicit;
distinguish language-level coverage from framework-specific features. Include
upstream documentation, launch/runtime requirements, protocol fixture tests,
and real-server evidence where available. Never claim native Windows/macOS or
every-server compatibility from a Linux fixture run.

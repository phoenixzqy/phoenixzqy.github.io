# Packages and distribution

This repository publishes Go modules directly through Git commits; no package
server, release tag, or release pipeline is required.

## Reusable packages

Import `cli/gitdiff/reader`, `tui/mux/review`, or `tui/gitcommands` under the
module path. `reader.Controller` implements the viewer's Git data contract;
`review.New` constructs the reusable viewer. The host owns refresh/update,
dimensions, observation and `Close`; it supplies a
`github.com/phoenixzqy/zai-design-system/theme.Theme` to `View`, and may call
`Viewer.SetThemeVariants` so the `t` toggle's forced dark and light modes use
its configured theme's variants instead of onedark-dark and onedark-light.
`View` returns a frame painted with the theme's colors (`layout.Paint`). Hosts
that own a settings page may call `Viewer.ShowSettingsButton(true)` and handle
`review.SettingsRequestedMsg`. The viewer handles F2 as well as clicks when
that control is enabled; hosts forwarding keys to the viewer must not also
handle F2 independently. `cli/gitdiff.Run` exposes the standalone command
without terminating the caller. Ask AI agent delivery is an explicit host
callback, not a standalone runtime dependency.

`review.CommitURLController` is an optional local-metadata URL resolver;
`reader.Controller` implements it. Hosts forwarding viewer commands/messages
inherit commit copy and browser actions without changing their required
controller interfaces. Suspend/Close cancels pending browser-launch requests;
an already opened external browser remains user-owned.
`Viewer.SetSettingsCommand` optionally supplies a message-producing `tea.Cmd`
for the F2 footer button; the host owns handling that message and opening
settings. `Viewer.ShowQuitHint` opts into the Ctrl+Q control and
`review.QuitRequestedMsg`; the standalone host closes the viewer, while
embedded hosts omit this control.

The no-changes page draws the design-system mark as cell art by default.
Hosts that draw a terminal image may call `Viewer.LogoSlot(theme)` to get the
full-size mark's rectangle and background color. When the image layer is ready,
call `Viewer.SetImageMode(true)` before `View(theme)` to reserve those cells.
Call `SetImageMode(false)` whenever the image is unavailable or withdrawn
(including resize, overlays, and teardown) so the text mark returns. Reevaluate
the slot and image availability on each frame; a compact or hidden mark has
no slot. Hosted viewers that do not draw images need no special handling.

See architecture for ownership and compatibility rules.

## Build archives

```text
python scripts/package.py --output dist
```

The default archive version is Go's canonical version of the clean,
already-pushed local HEAD commit. Untagged commits receive unique
pseudo-versions; existing semantic tags remain valid. It does not increment a
version file or create tags. Unpushed commits or missing Git read credentials
fail explicitly. Use `--version v0.0.0-local` for an uncommitted local snapshot.

This produces a deterministic source ZIP and a native executable ZIP, each
with a SHA-256 sidecar. Binary ZIPs include dependency/runtime and
embedded-asset notices under `licenses/`; preserve these when distributing or
installing them. Use `--source-only` or `--goos` and `--goarch` as needed.
Source ZIPs include the README, its images, and the `docs/` guides, but not
contributor material (`CONTRIBUTING.md`, `.github/`), repository tooling
(`scripts/`), or the demo video, which is hosted as a GitHub attachment so
package consumers do not download it with the Go module. Links to contributor
material and the guides' tooling commands, such as local validation and
packaging, work only in a clone.
Extract a binary archive into a directory on PATH; no registry, zai install,
or sibling clone is required.

## Consume from Git

Commit and push through the repository's local pre-push gate. Every pushed
commit is available as a Go module; no archive upload or publish job is needed.
Consumers need Git read access (for example through `gh auth setup-git`) and
must add `github.com/phoenixzqy/zai-gitter` to `GOPRIVATE` before fetching,
preserving existing private patterns. For example, from a consumer module:

```text
go get github.com/phoenixzqy/zai-gitter@<commit>
go mod tidy
```

Go writes the canonical version and checksums to `go.mod`/`go.sum` and
downloads source into its module cache. Do not invent pseudo-versions.
`@latest` prefers release tags, so it is not a way to follow every
default-branch commit. zai-cli's package builder resolves the remote
default-branch HEAD on every build and pins the resulting version; its
`--locked-tools` option reproduces prior pins. Updating source does not change
already-installed binaries.

Source manifests record every file hash, the source revision, and whether the
source checkout was dirty. See provenance, including
the patched Bubble Tea requirement: Go does not inherit module replacements and
excludes nested modules from downloaded module ZIPs. Hosts must supply
compatible terminal patches themselves. Build the standalone app from a
checkout or use its binary archive; `go install ...@version` does not support
the module's local replacement directives. Source archives remain optional
standalone artifacts, not the transport used by zai-cli. Change the source
here, never the module cache.

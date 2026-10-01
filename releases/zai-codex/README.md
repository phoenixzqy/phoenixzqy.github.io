# zai-codex publishing instructions

Use these instructions with the authoritative [publishing contract](../README.md).
The app's source/default/customization branch is **`zai-codex`, not `main`**.
`main` in the source repository mirrors OpenAI upstream; this website publishes
from its own `main`. Source PRs target `zai-codex`; website PRs target `main`.

## Reuse the source tools

Claim separate worktrees for `phoenixzqy/zai-codex` and this website. After the
source release tools merge, fetch `origin/zai-codex` in the source worktree and
build from its clean HEAD. Do not copy the source checkout into the public site.
Follow the source repository's `RELEASING.md` for native prerequisites, local
validation, dependency notices and smoke checks. Hosted Actions are disabled
there; publication does not enable them.

On each advertised native host, use the same source commit and custom version:

```sh
python3 -B scripts/prepare_zai_codex_release.py --version 0.1.0 --third-party-notices /path/to/reviewed-notices --output /path/to/release-assets
```

Use `python` on Windows. The reusable packager emits a complete canonical bundle
as `zai-codex-<version>-<target>.zip`, plus a bare SHA-256 sidecar. Targets are GNU
Linux x64/ARM64, macOS Intel/Apple Silicon and Windows MSVC x64/ARM64. GNU Linux
requires compatible glibc and is not an Alpine/musl package. Advertise only the
packages actually built and verified. Cross-compilation alone does not establish
native macOS or Windows correctness.

Review archive contents, Apache LICENSE/NOTICE, modification attribution,
applicable third-party notices and `zai-release.json` provenance. The packager
requires notices but cannot certify their completeness. Check all packages name
the same `zai-codex` commit, version and `zai-codex-v<version>` website release tag.
Smoke-test version, interactive Copilot login and launch on the native targets.
Report actual signing/notarization status and fulfill bundled dependency licenses.

## Keep the site installers synchronized

Reuse `scripts/install_zai_codex.py` from the reviewed source customization
commit. From this website worktree, run:

```sh
node scripts/sync-zai-codex-installer.mjs /path/to/claimed-zai-codex-worktree
npm run build:installers
```

This copies only the intentionally public installer into
`install/templates/zai-codex.py.in`, records the source commit/hash in
`install/zai-codex-source.json`, and generates self-contained
`install/zai-codex.sh` and `.ps1`. Review the copied script for privacy and behavior
before committing. Never edit generated installers. The generator rejects
modified templates whose hash no longer matches the recorded source. Before a
release, use the merged, freshly fetched `origin/zai-codex` revision; pre-merge
PR synchronization is review evidence only, not an available release.

The installers require Python 3.10+ and use this site's
`releases/zai-codex/latest/manifest.json`. They verify size/SHA-256, reject archive
traversal/links, validate bundle provenance and smoke-test before activation.
They retain complete old bundles and preserve `codex`. Defaults are
`~/.local/lib/zai-codex` and `~/.local/bin/zai-codex` (`.cmd` on Windows).
`ZAI_INSTALL_DIR` places the launcher there and bundles in its
`releases/zai-codex` subdirectory; the source-specific overrides
`ZAI_CODEX_INSTALL_ROOT` and `ZAI_CODEX_BIN_LINK` remain supported.
`ZAI_RELEASE_MANIFEST_URL` overrides metadata for isolated checks; only literal
`127.0.0.1` permits HTTP and test downloads must not redirect. Test installation
and upgrades with isolated paths; add the launcher directory to PATH if needed.

## Publish packages and metadata

Keep `latest/manifest.json` at `release: null` until actual packages are ready.
For the first release use custom version `0.1.0`, independent of the upstream
version embedded in the executable. Subsequent releases repeat this workflow.

Upload reviewed final ZIPs to a draft release on
`phoenixzqy/phoenixzqy.github.io`, tagged **`zai-codex-v<version>`** and targeting a
website commit. Never create a source-repo release as the website download source.
For example, pass explicit verified paths to:

```sh
gh release create zai-codex-v0.1.0 --repo phoenixzqy/phoenixzqy.github.io --target <website-commit> --draft --title 'zai-codex 0.1.0' --notes-file /path/to/release-notes.md /path/to/release-assets/zai-codex-0.1.0-x86_64-unknown-linux-gnu.zip
```

Include all verified targets. Release notes identify the source commit, platform
requirements, signing state, verification and known limitations. Review the draft
before publishing, then verify unauthenticated downloads and recompute their
hashes. SHA-256 verifies bytes, not publisher signing.

Populate `latest/manifest.json` with actual version, UTC publication time, notes
and assets. Map targets to `linux`/`macos`/`windows` and `x64`/`arm64`; use final
ZIP sizes/hashes, honest signing states and installation notes. Asset URLs use
`https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/zai-codex-v<version>/<filename>`.
Keep sidecars in release staging or release assets, not `latest/`. Update the
catalog's stage/platform readiness when packages become available. Keep the
intro focused on Copilot subscription support and disabled remote telemetry/
diagnostics; local logs remain available.

Run `npm run validate:apps` and the site checks, open a labeled website PR, then
follow the publishing contract for Pages deployment and public URL verification.
The one-line commands are `/install/zai-codex.sh | sh` and
`/install/zai-codex.ps1 | iex`, using the full HTTPS site URL. Remove disposable
staging/test artifacts and release both worktrees after the handoff.

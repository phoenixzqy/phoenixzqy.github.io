# Publishing app releases

This is a **public, binary-distribution surface**. Source repositories stay
private. Publish only app descriptions and final packages explicitly cleared
for public distribution. Never copy a private checkout, credentials, signing
keys, user data, logs, debugging symbols, source maps, or source archives here.
Review the contents of each package, not just its filename.

## URLs and layout

- `/` — app catalog homepage (`/apps/` remains a backward-compatible alias).
- `/about/` — résumé and portfolio, linked from the app navigation.
- `/apps/app/?id=bplayer` — app introduction, features, and platform readiness.
- `/apps/releases/?id=bplayer` — latest release, package filters, installation
  notes, signing status, and SHA-256 checksums.
- `/releases/bplayer/latest/manifest.json` — release metadata.
- `/releases/bplayer/latest/<package-filename>` — locally hosted package.
- `/apps/docs/?id=bplayer` — mirrored user documentation, when the entry sets
  `"documentation": true`.
- `/install/<app-id>.sh` and `/install/<app-id>.ps1` — one-line installers.
- `/uninstall/<app-id>.sh`, `.ps1`, and `.py` — standalone app uninstallers.

The detail and download pages are shared by every app. Add an entry to
`apps/catalog.json` and a `releases/<id>/latest/manifest.json`; no new HTML or
JavaScript is needed for an additional project. IDs must be lowercase,
hyphen-separated slugs, such as `bplayer` or `another-app`. Follow BPlayer's
catalog fields for the introduction, features, platform notes, and installation
instructions. The catalog order is the display order.

Every app must have a manifest. Before its first public build:

```json
{
  "schemaVersion": 1,
  "appId": "bplayer",
  "release": null
}
```

`null` means intentionally unpublished. Missing, invalid, or unreadable metadata
is an error, not an empty successful release. Published package metadata belongs
in the app's current manifest, independently of its source repository.

## Localized display text

The app pages support `en` and `zh-CN`, with a header selector and shareable
`lang` URL parameter. Existing pipelines that publish plain English strings
remain supported. To include Simplified Chinese, use a localized text object:

```json
{
  "name": {
    "en": "Windows application",
    "zh-CN": "Windows 应用程序"
  },
  "installNotes": {
    "en": "Extract the entire archive and keep the bundle together.",
    "zh-CN": "请完整解压并保留整个应用程序包。"
  }
}
```

This format is supported for these display fields:

- Catalog: app name, category, tagline, summary, stage, notice, each description
  and installation paragraph; platform names/statuses; feature titles and
  descriptions; comparison introductions, group titles, columns, row labels,
  cells, notes, and source-link labels; screenshot alt text and captions;
  artwork alt text; video title and caption; installation command labels.
- Release: each release note and each asset's `name` and `installNotes`.

Every localized object requires non-empty `en`. `zh-CN` is optional, but must
be non-empty when supplied; unsupported locale keys are rejected by
`npm run validate:apps`. A plain string or missing Chinese entry is shown in
English. Chinese pages explain this fallback instead of claiming a machine
translation. There are no translation API calls.

Do not localize IDs, platform/architecture identifiers, file paths, URLs, image
dimensions, version/channel values, timestamps, byte counts, checksums, or
signing states. One manifest describes the same packages in both languages.
Refresh translations with each release; do not carry old release notes into
a new version merely to populate a locale.

## App media

Screenshots, demo videos, and artwork live in the app's own folder,
`apps/media/<app-id>/`. An entry may only reference files in its own folder;
`npm run validate:apps` rejects anything else and confirms every referenced
file exists as a regular file in this repository.

```json
{
  "artwork": { "src": "/apps/media/zai-gitter/zai-logo.png", "alt": "…", "width": 414, "height": 164 },
  "videos": [
    {
      "src": "/apps/media/zai-gitter/review-demo.mp4",
      "poster": "/apps/media/zai-gitter/review-demo-poster.webp",
      "width": 1280,
      "height": 768,
      "muted": true,
      "title": { "en": "…", "zh-CN": "…" },
      "caption": { "en": "…", "zh-CN": "…" }
    }
  ]
}
```

Videos must be `.mp4` or `.webm`, posters `.png`, `.webp`, or `.avif`. Each
video renders as `<video controls preload="none" playsinline poster=…>`: it
never autoplays or loops, so it costs nothing until a visitor asks for it and
needs no separate reduced-motion handling. Set `"muted": true` only when the
file genuinely has no audio, and describe the content in the caption so the
video is not the only way to learn what the app does. Keep encodes small —
H.264, `+faststart`, no wider than 1280 px, a few megabytes each — because Pages
serves them from this repository.

## One-line installers

`install/<app-id>.sh` and `install/<app-id>.ps1` are served as plain static
files and must stay self-contained: they are consumed as
`curl -fsSL https://phoenixzqy.github.io/install/<app-id>.sh | sh` and
`irm https://phoenixzqy.github.io/install/<app-id>.ps1 | iex`. Generate them
with `npm run build:installers` from `install/templates/`; `npm test` fails if a
published file drifts from its template.

Downloads use HTTPS, including every redirect. The manifest URL override
permits plain HTTP only for literal `127.0.0.1` test fixtures; plaintext
redirects are rejected, and non-loopback HTTP overrides are not trusted.

An installer reads `/releases/<app-id>/latest/manifest.json`, selects the asset
matching the machine's platform and architecture, downloads it, verifies its
SHA-256 against the manifest, and installs it. When `release` is `null` it
explains that nothing is published yet and exits non-zero. `ZAI_INSTALL_DIR`
and `ZAI_RELEASE_MANIFEST_URL` override the install location and the metadata
source. Because the installers only trust the manifest, publishing a release is
a pure data change to `manifest.json`.

Prerequisites are checked before release downloads. The zai-cli bootstrap requires a working Python 3.10+ interpreter (`python3`/`python` on macOS/Linux; `py -3`/`python`/`python3` on Windows), then runs `install.py` from the verified archive root. macOS/Linux bootstraps for the standalone tools require Python 3 for metadata parsing. Shell installers also check for `curl` or `wget` and `sha256sum` or `shasum`; ZIP extraction can fall back to the selected Python interpreter. Missing, old, or broken Python fails with installation guidance before the bundled installer creates `~/.zai`. Coding-agent CLIs, Git, and Node.js/npm are runtime dependencies where needed, not prerequisites for installing the zai archive.

Installing zai-cli exposes the public `zai`, `zai-editor`, and `zai-gitter`
commands. Its archive contains all three public binaries at the root
(with `.exe` on Windows). The bundled `install.py` owns executable validation
and installation; the bootstrap reports public commands present afterwards.
Installing either standalone tool exposes only its own command and preserves
existing sibling apps in the shared installation directory.

After installation, each bootstrap prints commands to activate the executable in the current terminal. Shell installers detect a recognized parent shell, falling back to `SHELL`: bash/zsh suggest `source` for an existing profile mentioning the installation PATH; POSIX shells use `.`. These shells always receive an explicit `export PATH` command afterward, even when a profile is sourced, because matching profile text does not guarantee that it adds the actual launcher directory. Fish receives `set -gx PATH` with fish-specific literal escaping, PowerShell receives `$env:Path`, and unknown shells receive the quoted executable path. Run the printed commands in the calling terminal: a child installer cannot change its parent shell's environment. zai-codex activation respects its launcher override and defaults to `~/.local/bin`.

An entry may advertise these commands on its detail page:

```json
{
  "installCommands": [
    { "label": { "en": "macOS and Linux", "zh-CN": "macOS 与 Linux" }, "command": "curl -fsSL https://phoenixzqy.github.io/install/zai-cli.sh | sh" }
  ]
}
```

Commands must be plain printable ASCII so they survive copy and paste.

## One-line uninstallers

The zai apps also expose `uninstallCommands` and localized `uninstallation` notes on their detail pages. Generate `/uninstall/<app-id>.sh`, `.ps1`, and `.py` with `npm run build:installers` from `install/templates/uninstaller.*.in`; the source repositories carry matching standalone scripts. All cleanup logic is embedded in each shell entrypoint, with no additional network fetch or dependency on an installed app. Python 3.10+ is required on every platform.

```sh
curl --proto '=https' --proto-redir '=https' -fsSL https://phoenixzqy.github.io/uninstall/zai-editor.sh | sh
```

```powershell
irm https://phoenixzqy.github.io/uninstall/zai-editor.ps1 | iex
```

These are destructive app removals: close the apps and services first. Set `ZAI_UNINSTALL_DRY_RUN=1` to preview; `ZAI_INSTALL_DIR` selects a custom absolute install directory. Local `.py`, `.sh`, and `.ps1` scripts also accept `--dry-run` and `--install-dir`. App-owned settings, runtime homes, logs, and data are removed; sibling apps, project files, Git worktrees, and independently installed coding agents are preserved. Custom editor data and theme locations use their original `ZAI_EDITOR_LSP_HOME`, `ZAI_EDITOR_PREVIEW_HOME`, and `ZAI_THEME_CONFIG` variables. The shared PATH entry remains while another executable needs it. Otherwise exact installer-added profile lines or the matching Windows user PATH entry are removed; manually authored shell configuration is preserved. Open a new terminal afterwards. The shared `releases/install.lock` is retained to preserve installer coordination; partial failures retain a per-app recovery marker for retry. Ambiguous caches in custom LSP roots and global theme settings are preserved.

Uninstaller content provenance: the owner requested per-app cleanup on 2026-10-01. The published templates and disposable-home regression fixtures define and verify the behavior described here and in the catalog; no private application source or release package is copied into the public site.

## App comparison tables

An app may publish structured comparison tables near the top of its detail
page with a `comparison` object:

```json
{
  "comparison": {
    "intro": "What this comparison covers.",
    "groups": [
      {
        "title": "Capabilities",
        "columns": ["This app", "Alternative"],
        "rows": [
          {
            "label": "Runs over SSH",
            "values": ["✓", "— [1]"]
          }
        ],
        "notes": ["The alternative requires a local desktop UI."]
      }
    ],
    "source": {
      "label": "Read the complete evidence on GitHub ↗",
      "url": "https://github.com/example/app#how-it-compares"
    }
  }
}
```

The number of values in every row must exactly match the number of columns.
Use `[1]`, `[2]`, and so on in cell text to link claims to comparison notes.
Note numbering continues across every comparison group for an app rather than
restarting at each table, and every reference must identify an existing note.
Use positive numbers without leading zeros (for example, `[1]`, not `[01]`).
Keep comparison claims factual, qualified, and traceable to the linked public
source. Include competitor strengths and measurement limits rather than
presenting a one-sided scorecard. Source URLs must use public HTTPS.

## Mirrored documentation

An entry with `"documentation": true` must have a matching allowlist entry in
`apps/docs/sources.json` and a generated mirror in `apps/docs/<app-id>/`.
Mirrors are produced by `scripts/sync-app-docs.mjs` and are never hand-edited;
`npm run validate:apps` checks that the committed files match the generated
index and that the recorded source commits agree. See
[app docs sync](../.github/skills/app-docs-sync/SKILL.md) for the workflow and
the required privacy review.

## Pipeline contract

After building and approving packages in the private app pipeline:

1. Check out this **public website repository** in a separate directory, using
   a credential restricted to this repository. Do not put credentials in
   manifests, URLs, command arguments, or committed files.
2. Stage the complete new package set and manifest under
   `releases/<app-id>/latest/`. Replace the old latest files as part of the same
   commit. Use versioned filenames; never overwrite a versioned public asset
   with different bytes.
3. Compute `bytes` from each final package's file size and `sha256` from those
   exact bytes, after packaging and signing. For example:
   `sha256sum BPlayer-0.7.0-windows-x64.zip` (Linux),
   `shasum -a 256 <file>` (macOS), or
   `Get-FileHash <file> -Algorithm SHA256` (PowerShell).
   Store the hash in lowercase.
   Android App Bundles may include a ProGuard/R8 debugging map under
   `BUNDLE-METADATA/com.android.tools.build.obfuscation/`. Keep that map private
   and exclude it from public packages, preferably before signing. If removing
   it from an already signed bundle, verify the resulting JAR signature and
   retained signing identity, then use a new filename and checksum; never
   replace the bytes of an existing versioned asset.
4. Run `npm run validate:apps` using the Node.js version pinned in `.nvmrc`.
   This validation uses only Node's standard library; an `npm install` is not
   needed for this command.
   It checks the catalog and every manifest, enforces safe package paths,
   rejects unlisted files/symlinks, and verifies the size and checksum of every
   locally stored package.
5. Review and commit **only the intended catalog/manifest/package changes**,
   then push to `main` to trigger the existing GitHub Pages deployment.
   Wait for `pages-build-deployment` to succeed before announcing the release.
   Serialize website publishing across app pipelines or fetch/rebase and
   revalidate on push conflicts; do not force-push.
6. Verify the public package URL and its downloaded checksum. The website shows
   validated metadata, but does not download every package merely to display
   the list. A manifest does not establish that a remote package exists.

No app pipeline, signing setup, or cross-repository credential is configured
by this website. Those remain in the private build environment.

### Populated manifest example

The size and checksum below are illustrative. **Replace them with real values**;
the validator rejects mismatched local bytes.

```json
{
  "schemaVersion": 1,
  "appId": "bplayer",
  "release": {
    "version": "0.7.0+7",
    "channel": "preview",
    "publishedAt": "2026-09-22T12:00:00Z",
    "notes": [
      "Describe the changes in this specific approved build."
    ],
    "assets": [
      {
        "name": "BPlayer for Windows",
        "platform": "windows",
        "architecture": "x64",
        "file": "BPlayer-0.7.0-windows-x64.zip",
        "bytes": 12345678,
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "signing": "self-signed",
        "installNotes": "Development signature, not public Windows trust. Extract the entire bundle. Follow device and organization security policies."
      }
    ]
  }
}
```

`channel` is `preview` or `stable`. `version` is `major.minor.patch` with optional
prerelease/build metadata. `publishedAt` is an actual UTC timestamp in
`YYYY-MM-DDTHH:mm:ssZ` form. At least one release note and one package are required.
`platform` must match an ID in that app's catalog entry. `architecture` is a
human-readable label such as `x64`, `arm64`, or `universal`.

Each asset needs a unique package basename (`file`), display name, positive
byte count, SHA-256 hash, signing status, and non-empty installation notes.
Supported extensions: ZIP, APK, AAB, IPA, EXE, MSIX, DMG, PKG, DEB, RPM, AppImage.
Signing is publisher-reported: `unsigned`, `ad-hoc`, `self-signed`, or `signed`; do not
claim a development/self-signed certificate establishes public trust.
An AAB is a store-distribution artifact, not a directly installable APK.
An unsigned IPA needs authorized signing/provisioning before installation.
Explain such differences in the asset's installation notes.

### Large packages: public GitHub Releases

[GitHub blocks repository files over 100 MiB](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).
[GitHub Pages limits the published site to 1 GB and has a soft 100 GB/month bandwidth limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
Git history keeps old binary versions even after deleting them from `latest/`.
Prefer public GitHub Release assets for large or frequently updated packages.
Git LFS is not a substitute for static Pages downloads.

Upload approved packages as assets of a **public release on
`phoenixzqy/phoenixzqy.github.io`**, not the private app repository. Use
app-prefixed, versioned tags, for example `bplayer-v0.7.0-7`, targeting a website
commit. Do not push private app tags, source commits, or source archives to this
repository. GitHub's automatically generated source archives will then contain
only the public website.

Keep the per-app `latest/manifest.json` folder, but add `url` to the asset:

```json
"url": "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/bplayer-v0.7.0-7/BPlayer-0.7.0-windows-x64.zip"
```

Do not also copy that file into `latest/`. All other asset fields remain
required; the URL must match `file`. Only this website repository's HTTPS
release-download URLs are accepted: no private repository URLs, tokens,
query strings, or arbitrary third-party download hosts.

Upload assets to a draft public-repository release, review them, publish the
release, and confirm unauthenticated downloads work **before** publishing the
manifest. Local validation cannot verify a remote binary's existence, bytes,
hash, signing, licensing, or public visibility; your pipeline must do so.
Using a release URL does not grant distribution rights.

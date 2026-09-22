# Publishing app releases

This is a **public, binary-distribution surface**. Source repositories stay
private. Publish only app descriptions and final packages explicitly cleared
for public distribution. Never copy a private checkout, credentials, signing
keys, user data, logs, debugging symbols, source maps, or source archives here.
Review the contents of each package, not just its filename.

## URLs and layout

- `/apps/` — catalog, linked from the résumé's main navigation.
- `/apps/app/?id=bplayer` — app introduction, features, and platform readiness.
- `/apps/releases/?id=bplayer` — latest release, package filters, installation
  notes, signing status, and SHA-256 checksums.
- `/releases/bplayer/latest/manifest.json` — release metadata.
- `/releases/bplayer/latest/<package-filename>` — locally hosted package.

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
  descriptions; screenshot alt text and captions.
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
4. Run `npm run validate:apps` using Node.js 20 or newer. This validation uses
   only Node's standard library; an `npm install` is not needed for this command.
   It checks the catalog and every manifest, enforces safe package paths,
   rejects unlisted files/symlinks, and verifies the size and checksum of every
   locally stored package.
5. Review and commit **only the intended catalog/manifest/package changes**,
   then push to `master` to trigger the existing GitHub Pages deployment.
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

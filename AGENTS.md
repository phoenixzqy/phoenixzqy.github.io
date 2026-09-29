# Contributor instructions

This repository is a static GitHub Pages site published from the root of
`main`. Keep it static: no build output, application server, secrets, private
source, or runtime API credentials belong in the public tree. `.nojekyll` keeps
the files as-is.

## Edit map

- The app catalog homepage lives in `index.html`; `/apps/` remains its
  backward-compatible alias. The résumé lives in `about/index.html`,
  `styles.css`, and `script.js`; `favicon.svg` is the shared icon. Preserve
  usable content without JavaScript, keyboard access, reduced-motion behavior,
  and printable A4/Letter layouts.
- `apps/` contains the shared catalog, detail, download, and documentation
  pages. `apps/catalog.json` supplies app descriptions; `apps/locales.js`
  supplies UI strings. App-specific release metadata lives at
  `releases/<id>/latest/manifest.json`. Keep localized display text separate
  from identifiers, URLs, checksums, sizes, and signing states.
- `apps/media/<app-id>/` holds each app's own screenshots, demo videos, and
  artwork; nothing outside an app's own folder may be referenced by its entry.
  `apps/docs/` is a generated mirror of each app's user documentation, and
  `apps/vendor/` holds pinned third-party browser code with its license.
- `install/` holds the one-line installers served at
  `https://phoenixzqy.github.io/install/<app-id>.sh` and `.ps1`. They are
  generated from `install/templates/` by `npm run build:installers`; edit the
  templates, never the published files.
- `pwa-sw.js` is a *retired game's uninstall worker*, not an offline feature.
  Keep it at its old URL so returning browsers can remove only the old game's
  caches. `pwa-retired.html` is the same-origin redirect for old controlled
  tabs; preserve their original query and fragment. Do not reintroduce game
  registration or disturb other apps' caches.
- `tests/` holds Node unit tests and Playwright browser/PDF checks.

## Task-specific workflows

- For new design references or résumé/app content claims, follow
  [design research and provenance](.github/skills/design-research/SKILL.md).
  The [README](README.md#design-research) retains the completed site's
  historical research and [content provenance](README.md#content-provenance).
- For re-mirroring an app's user documentation into `apps/docs/`, follow
  [app docs sync](.github/skills/app-docs-sync/SKILL.md). It covers the
  allowlist in `apps/docs/sources.json`, the deterministic sync script, and the
  privacy review that must happen before any mirrored document is committed.
- For app-release preparation or publishing, follow
  [app releases](.github/skills/app-releases/SKILL.md). The
  [publishing contract](releases/README.md) is the authoritative, independently
  usable specification for public packages, metadata, verification, and
  cross-repository handoff. Do not substitute these instructions for it.

## Local checks

Use Node.js 24.21.0 (pinned in `.nvmrc`; `package.json` supports newer 24.x).
With nvm, run `nvm install` and `nvm use`; Python 3 serves the local preview
via `npm start` on `http://127.0.0.1:4173`. For full tests, run:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm test
```

`npm run validate:apps` validates catalog and release metadata and locally
hosted package bytes without installing dependencies. `npm run test:unit` runs
Node tests. `npm test` runs both plus desktop/mobile Chromium and WebKit and
Chromium PDF checks. Targeted browser runs:
`npx playwright test --project=webkit --project=mobile-webkit` or
`npx playwright test --project=pdf`. Playwright system dependencies may require
administrator privileges on Linux; emulation does not replace physical iOS
testing.

Run `npm run hooks:install` once per checkout to enable `.githooks/pre-push`
locally. Commit intended changes and stop any preview server before pushing:
the hook tests the current working tree, runs `npm test`, and blocks a failing
push. It is not server-side CI and other clones or release automation must
enable it separately.

# Qiyu Zhao — personal résumé

A static, AI-inspired résumé at **https://phoenixzqy.github.io/**. The root
`index.html` is the GitHub Pages homepage. No build step, application server,
API keys, or runtime JavaScript dependencies are required.

Contributors: start with [agent coding guidance](AGENTS.md) and the reusable
[design research](.github/skills/design-research/SKILL.md) and
[app-release](.github/skills/app-releases/SKILL.md) workflows. The
[publishing contract](releases/README.md) remains the standalone reference
for other repositories.

## Develop and publish

Development and tests use Node.js 24.21.0, pinned in `.nvmrc`; `package.json`
supports Node 24.21.0 and newer 24.x releases. With nvm, run `nvm install` and
`nvm use` in this checkout before installing dependencies. Python 3 is also
required for the local server.

Run `npm start` (Python 3 required), then open `http://127.0.0.1:4173`.
GitHub Pages is configured to publish the repository root on `master`.
Push the finished site to that branch to publish. `.nojekyll` keeps the site
as plain static files.

## Retired game PWA

The former game manifest, page, and icons have been removed; the current site
does not install a PWA. The old root `pwa-sw.js` remains an uninstall worker
for returning browsers, alongside `pwa-retired.html` to redirect old tabs.
See [contributor instructions](AGENTS.md#edit-map) for the preservation rules.

Cleanup requires the browser to come online and update the old worker. A
website cannot uninstall an existing OS/home-screen app shortcut; remove the
old game manually through the browser/device's installed-app controls. If a
browser still shows stale content, clear this site's stored data and reopen it.
Clearing site data also removes other locally stored data for this origin.

## Apps and downloads

The résumé navigation links to the multi-app catalog at `/apps/`. Shared detail
and download pages read `apps/catalog.json` and each app's
`releases/<id>/latest/manifest.json`. BPlayer is the first entry, with a
local-first audiobook-player introduction and explicit platform-readiness
notes. Its descriptions are paraphrased from the authorized local product
documentation; no private source or builds were copied. No package is offered
until a release is published.

See [the publishing contract](releases/README.md) for folder layout, manifest
fields, checksum/size validation, safe pipeline handoff, signing notices, and
large-package hosting through public GitHub Release assets. Run
`npm run validate:apps` before publishing metadata or binaries.
The app catalog uses JavaScript with explicit loading/error/no-JavaScript
messages; the résumé remains usable without JavaScript.

### App page languages and titles

The app catalog, details, and downloads support English and Simplified Chinese.
Use the header language selector or share a URL with `?lang=zh-CN` (append
`&lang=zh-CN` when an `id` is already present). Language priority is an explicit
`en`/`zh-CN` URL parameter, a saved `apps.locale` preference, a supported browser
language, then English. Browser `zh-*` preferences select Simplified Chinese.
Only deliberate language selections are stored locally; blocked storage does
not prevent switching or sharing locale-specific links. The résumé is unchanged.

UI strings live in `apps/locales.js`. Publisher content in `apps/catalog.json`
and release manifests accepts plain English text or `{ "en": "...", "zh-CN":
"..." }` values for display fields. English is required; missing Chinese text
falls back to English, with a notice on Chinese pages. See
[localized publishing metadata](releases/README.md#localized-display-text).
Download URLs, filenames, hashes, sizes, version identifiers, and signing states
are never translated. The existing gallery and actual release assets are shared
between locales.
Chinese app pages use Noto Sans SC from the same Google Fonts provider as the
existing site typography, with PingFang SC/Microsoft YaHei system fallbacks.

Page titles, descriptions, Open Graph metadata, and the document's `lang` are
updated centrally for each route and language, including loading/error states.
Release pages receive their app-specific title as soon as the app is known,
without waiting for the release manifest to load.

Google Fonts supplies DM Sans, IBM Plex Mono,
and Instrument Serif, with local system-font fallbacks. There are no analytics,
tracking scripts, or AI API calls.

The neural visualization is original Canvas 2D generative artwork. It responds
to a pointer, pauses outside the viewport or in background tabs, and respects
system reduced-motion preferences. A footer control pauses all decorative
motion. The SVG illustration and full résumé remain available without JavaScript.
Ctrl/Cmd+K opens keyboard navigation. **Print résumé** opens the browser's print
dialog; choose **Save as PDF** for a clean, text-based résumé including earlier roles.
Responsive layout breakpoints are screen-only so A4 and Letter printouts retain
the résumé's two-column experience layout without inheriting mobile flex rules.

## Content provenance

Experience comes from the profile text provided by Qiyu Zhao. Education dates,
university, and languages were visible in the public LinkedIn profile's
structured data at
https://www.linkedin.com/in/qiyu-zhao-b02352b6/ (read September 22, 2026).
No degree, unverified credential, performance metric, or private contact
information has been invented. Both Microsoft roles retain the supplied
“Present” end dates, rather than inferring an unconfirmed transition date.
The introduction paraphrases the supplied experience; project artwork is
conceptual, not an actual Microsoft product interface.

## Design research

Ten established developer/AI-industry personal sites were researched online
and their public pages read before implementation. These are design references,
not templates: no source code, proprietary assets, or résumé text was copied.
The lessons below describe the editorial or interaction ideas adopted, not a
claim that every reference has the same dark visual style.

| Reference | Lesson applied |
| --- | --- |
| [Brittany Chiang](https://brittanychiang.com/) | Make professional experience easy to scan, with a strong content hierarchy. |
| [Bruno Simon](https://bruno-simon.com/) | Give the portfolio one memorable, playful interactive centerpiece. |
| [Rauno Freiberg](https://rauno.me/) | Use concise typography and carefully restrained detail. |
| [Lee Robinson](https://leerob.com/) | State current work and professional identity directly. |
| [Josh W. Comeau](https://www.joshwcomeau.com/) | Treat motion as thoughtful interaction, not just decoration. |
| [Anthony Fu](https://antfu.me/) | Connect the person, their ecosystem, and concrete projects. |
| [Paco Coursey](https://paco.me/) | Prioritize craft, clear writing, and the small details of an interface. |
| [Hakim El Hattab](https://hakim.se/) | Let original visual experiments convey engineering personality. |
| [Matt Pocock](https://www.mattpocock.com/) | Make the introduction human and immediately understandable. |
| [Andrej Karpathy](https://karpathy.ai/) | Keep career information factual, chronological, and content-first. |

The resulting direction is an original dark technical/editorial layout:
warm off-white type, acid-lime accents, a connected spherical node field,
schematic project illustrations, and a quiet chronological résumé underneath.

## Checks

Run `npm run validate:apps` for app/release metadata, or `npm test` for the
complete Node and browser/PDF suite. See [local checks](AGENTS.md#local-checks)
for dependency setup, focused test commands, and the optional local pre-push
hook.

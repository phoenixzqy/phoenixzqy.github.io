# Qiyu Zhao — personal résumé

A static, AI-inspired résumé at **https://phoenixzqy.github.io/**. The root
`index.html` is the GitHub Pages homepage. No build step, application server,
API keys, or runtime JavaScript dependencies are required.

## Develop and publish

Run `npm start` (Python 3 required), then open `http://127.0.0.1:4173`.
GitHub Pages is configured to publish the repository root on `master`.
Push the finished site to that branch to publish. `.nojekyll` keeps the site
as plain static files.

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

Edit résumé content in `index.html`, visual styles in `styles.css`, and
interactions in `script.js`. Google Fonts supplies DM Sans, IBM Plex Mono,
and Instrument Serif, with local system-font fallbacks. There are no analytics,
tracking scripts, or AI API calls.

The neural visualization is original Canvas 2D generative artwork. It responds
to a pointer, pauses outside the viewport or in background tabs, and respects
system reduced-motion preferences. A footer control pauses all decorative
motion. The SVG illustration and full résumé remain available without JavaScript.
Ctrl/Cmd+K opens keyboard navigation. **Print résumé** opens the browser's print
dialog; choose **Save as PDF** for a clean, text-based résumé including earlier roles.

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

```sh
npm ci
npx playwright install chromium
npm test
```

Playwright covers desktop/mobile layouts, root routing, résumé content,
navigation, keyboard dialog behavior, print controls, no-JavaScript rendering,
reduced motion, and WCAG accessibility checks using axe-core.
App coverage also exercises multiple catalog entries, empty and populated
releases, exact downloaded bytes, platform filtering, unsafe metadata, and
checksum/size validation for pipeline-published packages.

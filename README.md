# Qiyu Zhao — apps and portfolio

A static app catalog at **https://phoenixzqy.github.io/** with the résumé and
portfolio at `/about/`. The root `index.html` is the GitHub Pages homepage. No
build step, application server, API keys, or runtime API credentials are
required.

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
GitHub Pages is configured to publish the repository root on `main`.
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

The multi-app catalog is the homepage at `/`, with `/apps/` retained as a
backward-compatible alias. The résumé and portfolio live at `/about/`. Shared detail
and download pages read `apps/catalog.json` and each app's
`releases/<id>/latest/manifest.json`. BPlayer is the first entry, with a
local-first audiobook-player introduction and explicit platform-readiness
notes. Its descriptions are paraphrased from the authorized local product
documentation; no private source or builds were copied. No package is offered
until a release is published. The author-supplied horizontal BPlayer logo
(reviewed September 29, 2026) retains its original 413 × 180 dimensions
and ratio for responsive catalog and detail-page rendering.

The zai apps — zai (`zai-cli`), zai-editor, and zai-gitter — follow the same
entry style. Their pages add short demo videos, copyable one-line install
commands, and a link to the user documentation mirrored under `/apps/docs/`.

See [the publishing contract](releases/README.md) for folder layout, manifest
fields, checksum/size validation, app media, one-line installers, mirrored
documentation, safe pipeline handoff, signing notices, and large-package
hosting through public GitHub Release assets. Run `npm run validate:apps`
before publishing metadata or binaries.
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

The zai-cli, zai-editor, and zai-gitter descriptions and comparison tables
paraphrase the app author's supplied README material; the comparison sections
link back to those public README evidence and methodology sections. The
allowlisted user documentation has source commit identifiers in
`apps/docs/sources.json`. The app author supplied the wordmark and demo
recordings for the site. For the September 30, 2026 update, the author also
supplied a zai-cli status-hint screenshot for the app detail page, then
supplied the zai-cli app init page and managed-worktrees screenshots and the
general-features and themes demo recordings. No private
source, contributor instructions, or unpublished packages belong in the public
mirror.

The September 30, 2026 manual releases — [zai-cli 0.1.200](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-cli-v0.1.200), [zai-editor 0.3.2](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-editor-v0.3.2), and [zai-gitter 0.3.2](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-gitter-v0.3.2) — use the app author’s authorized merged source and repository-owned release scripts. Release notes were checked against those revisions; source identities for the privacy-reviewed user-guide refresh are recorded in `apps/docs/sources.json`. Each release supplies six unsigned archives with sizes and SHA-256 values computed from the final bytes. Archive contents and native Linux smoke checks were reviewed; cross-compilation does not establish native macOS or Windows behavior.

The October 1, 2026 [zai-cli 0.1.213 release](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-cli-v0.1.213) follows the author’s authorized merged updates to Sessions search and previews, coding-agent preferences, repository symlink handling, session titles, and service-monitor transcripts. The refreshed allowlisted guides record their source revision in `apps/docs/sources.json`; release sizes and SHA-256 values come from the final unsigned package bytes.

The later October 1, 2026 manual releases — [zai-cli 0.1.246](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-cli-v0.1.246), [zai-editor 0.3.3](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-editor-v0.3.3), and [zai-gitter 0.3.3](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-gitter-v0.3.3) — were built from the then-current `main` revisions with each repository's release scripts. The final unsigned archives passed their repository-owned packaging tests, checksum verification, archive-content review, and privacy scans. The synchronized allowlisted user guides were reviewed separately and record the exact source revisions in `apps/docs/sources.json`.

For the September 29, 2026 zai positioning refresh, the public
[herdr README](https://github.com/herdrdev/herdr) and
[Orca README](https://github.com/stablyai/orca) were reviewed for editorial
structure. Their concise category-first lines — a runtime for coding agents and
an AI orchestrator for builders — informed the decision to give zai one short,
original outcome statement: “One terminal. Many agents. One delivery loop.”
No wording, source code, layout, or assets were copied. Product and comparison
claims continue to come from the zai repositories' documented behavior,
measurements, and linked public evidence.

The Codex integration preview wording comes from the app author's requested
integration and zai-cli's Codex setup guide, reviewed September 29, 2026.
It explicitly targets [codex-evo](https://github.com/idleai/codex-evo), not all
Codex distributions, and does not claim native Copilot extension compatibility
or full feature parity. No unpublished executable is linked from the site.

The OpenCode integration preview wording was reviewed September 29, 2026,
against the app author's supplied zai-cli integration and user guide, plus
OpenCode's public [CLI](https://opencode.ai/docs/cli/) and
[plugin documentation](https://opencode.ai/docs/plugins/). It distinguishes
zai workflow support from native CLI feature identity, states the 1.18.33+
requirement, and discloses the missing blocking stop-hook equivalent.
No credentials, private implementation, or unpublished package is published.

The September 30, 2026 Copilot app comparison refresh follows the author's
authorized [zai-cli README update](https://github.com/phoenixzqy/zai-cli/pull/136)
at revision `f8cd4947cb1c10eb1aba2456b21643241ca3df77` and its benchmark report.
The [official GitHub Copilot app overview](https://docs.github.com/en/copilot/concepts/agents/github-copilot-app),
accessed on that date, verifies its parallel worktrees, scheduled automations,
and GitHub PR workflow. Only sanitized native Windows first-run summaries are
repeated here; raw process reports and local paths are not published. Linux
workspace-only PSS baselines remain separate from Windows USS/RSS observations,
and selected CLI/runtime requirements are explicit. No complete-setup ranking,
untested editor/LSP absence, or inferred UI implementation stack is claimed.

The September 30, 2026 integrated-table revision uses the existing capability
and footprint tables for zai-cli, VS Code, GitHub Copilot app, Orca, and herdr;
there is no standalone Copilot comparison. Agent-qualified headers and note [6]
clarify that zai-cli, Orca, and herdr need a separately installed coding agent.
Windows/Linux provenance and metric limits remain explicit in the shared table.
The synchronized README and exact measurement provenance are recorded at
[zai-cli revision e4587078](https://github.com/phoenixzqy/zai-cli/commit/e4587078d12e9f5d2c52670bfdcfe612d61705a1).
Sources read directly on 2026-09-30:

| Source | Verified claim and editorial use |
| --- | --- |
| [GitHub app changelog, f37efcac](https://github.com/github/app/blob/f37efcac9f6563656e6bc9c49ccbdb20ddb3a856/changelog.md) | v1.1.21 confirms a code editor; v1.1.15 confirms line numbers and syntax highlighting. Mark the editor supported. v0.2.8 confirms scheduled automation workspace reuse, which does not verify a shared claim/release pool with stale-owner recovery. |
| [Agent sessions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/agent-sessions) | Isolated workspaces, archive/delete management, and cloning non-GitHub Git URLs including Azure DevOps; does not establish native Azure DevOps delivery services. |
| [Issue and PR workflows](https://docs.github.com/en/copilot/how-tos/github-copilot-app/managing-issues-and-pull-requests) | CI/review fixes and background agent merge; retain the supported GitHub workflow entry. |
| [App overview](https://docs.github.com/en/copilot/concepts/agents/github-copilot-app) and [product page](https://github.com/features/ai/github-app) | Desktop app built on Copilot CLI, parallel sessions, and scheduled workflows; do not infer the UI implementation stack or LSP support. |
| [Orca overview](https://www.onorca.dev/docs) and [herdr product page](https://herdr.dev/) | Both run users' existing coding-agent CLIs; use the shared separately installed agent footnote. |

LSP support, the specific shared claim/release pool, native Azure DevOps
work-item-to-merge services, and UI implementation stack remain explicitly
unverified. These are public-documentation findings, not signed-in app tests.
No measurement was recollected and no complete-setup ranking is inferred.

The October 1, 2026 installation documentation audit follows the author's request to check zai-cli against its current implementation. The source revision in `apps/docs/sources.json` records the direct setup guide and privacy-reviewed mirror. The generated [shell installer](install/zai-cli.sh) and [PowerShell installer](install/zai-cli.ps1) substantiate the Python prerequisite probes and bundled installer flow; the catalog now separates installation prerequisites from repository-session requirements and uses automatic configuration defaults.

The October 2, 2026 release refresh uses the author's authorized current-main
changes and user guides for
[zai-cli 0.1.303](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-cli-v0.1.303),
[zai-editor 0.3.4](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-editor-v0.3.4),
and [zai-gitter 0.3.4](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-gitter-v0.3.4).
The bilingual notes describe the Usage dashboard, workspace restoration,
terminal image previews, source-location opening, buffer indentation, and
headless browser previews without adding performance or platform-trust claims.
The privacy-reviewed documentation mirrors record their exact source revisions
in `apps/docs/sources.json`; release archives contain approved runtime files
and license notices, not private application source or debugging symbols.

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

The zai-codex introduction uses the author's authorized release brief and the
customization source reviewed on October 1, 2026: GitHub Copilot subscription
login, disabled telemetry exporters and disabled remote feedback/error uploads.
Local diagnostic logs remain available. Its first-release manifest is explicitly
unpublished; Linux, macOS and Windows are intended targets, with package
availability determined by verified release assets. Future maintainers should
follow [the zai-codex instructions](releases/zai-codex/README.md), which reuse the
source packager and installer and record the `zai-codex` branch exception.

The October 8, 2026 feature refresh uses the author's authorized CLI image-rendering
update and customization source at `0494086573b61be7f361b94002bd87f243c876e0`.
Viewed and generated image previews use Kitty graphics, Sixel, or iTerm2 image
support; unsupported terminals retain text output. This describes the fork's
capability without changing the published release metadata.

The October 3, 2026 release refresh uses the author's authorized merged-main
updates for [zai-cli 0.1.341](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-cli-v0.1.341),
[zai-editor 0.3.5](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-editor-v0.3.5),
and [zai-gitter 0.3.5](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-gitter-v0.3.5).
The release notes follow those source revisions: editor groups, Find/Replace,
bracket matching and buffer-word completion; console lifecycle and side-rail
fixes; and bounded painting caches. The allowlisted guides record the exact
privacy-reviewed revisions in `apps/docs/sources.json`. Repository-owned
release scripts produce the six unsigned archives per app; byte counts and
SHA-256 values come from the final packages. Cross-compilation does not
establish native macOS or Windows behavior.

The October 6, 2026 app-page refresh follows the author's request to feature context menus in zai-cli, zai-editor, and zai-gitter, and the local persistent console server in zai-cli. English and Simplified Chinese copy was checked against installed app help and the author's current console-server, editor, and Git viewer user guides. The console lifecycle evidence is at source revision `9f30ab0043310c1133a37d73f0961cfbd815f003`; editor menu evidence is at `cb0431be93bacc8adcca005723906c66fcdc8cc3`, and Git viewer menu evidence is at `aedd68337cc36c8a388cdfcbe9de201f6b226702`. Only public-facing behavior is paraphrased here; no private source or internal runbook is copied.

The initial October 6, 2026 release-availability check found [v0.1.390](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-cli-v0.1.390), built from source revision `2bc5f92edea7be88dcc2376676ee994590b3261c`, which restored saved layout with fresh shells and did not preserve live jobs after client closure. A subsequent check on the same date found that the current [zai-cli manifest](releases/zai-cli/latest/manifest.json) delivers [v0.1.394](https://github.com/phoenixzqy/phoenixzqy.github.io/releases/tag/zai-cli-v0.1.394). Its public release provenance identifies the exact console-server and bundled editor/Git viewer revisions cited above. All six archives were downloaded without authentication and their byte counts and SHA-256 values matched the manifest. The English and Simplified Chinese catalog copy and comparison therefore describe persistence as available from v0.1.394; this app-page refresh does not publish another release or claim native validation on every platform.

The persistent console server allows reconnection to the same host and runtime home, including over SSH, while the host stays awake and the server remains running. Detach preserves live console-owned processes; Close completely stops them. This does not promise process survival after server or machine restart. The [herdr README](https://github.com/herdrdev/herdr#readme), read directly on October 6, 2026, documents its background-server detach/reattach behavior and informed the additional capability row. The comparison describes the released zai feature alongside herdr's documented behavior without claiming herdr's combined multi-machine view for zai or inferring absence in other apps that were not assessed.

The three context-menu images are actual terminal frames captured from the running apps at 132 × 38 cells in Kanagawa Wave, then rendered to PNG for the site. They use a task-owned demo workspace with synthetic Go code and a synthetic Git diff, not private project code or real agent transcripts. The console image is cropped below its pane border to omit the temporary capture path in the footer. The author requested the captures and authorized their use on these pages; the existing galleries and release assets are retained.

The October 6, 2026 installer-first page update follows the author’s request to make the existing install/uninstall commands the first content section after the app heading and the preferred setup path on introduction and release pages. The setup and checksum wording follows the [publishing contract](releases/README.md#one-line-installers), and the existing catalog retains app-specific prerequisites and removal warnings. Package links remain available for manual installation; no new packages or platform availability are claimed.

## Local validation

Install the local gate with `npm run hooks:install`. The hook requires the
outgoing refs to resolve to the checked-out HEAD and a clean index/worktree,
including untracked files, before and after validation. Direct `npm test`
always runs the complete suite.

Contributor prose (`README.md`, root agent guidance, `.github/**/*.md`, the
release README files, and `scripts/app-release/README.md`) runs the hook
regression tests without browser/PDF checks. Changes limited to Markdown,
JSON, and PNG/JPEG/GIF/WebP assets under `apps/docs/` also run
`npm run validate:apps` and `tests/docs-mirror.test.js`, retaining mirror
integrity and privacy validation. Published docs are not excluded as prose.

All other paths, symlink or executable-mode changes, and mixed code/docs
pushes run `npm test`. The classifier examines every outgoing commit across
all refs, includes both sides of renames and reverted source changes, and
defaults to the full suite for missing history, non-ancestor updates, empty
change sets, or more than 200 commits. Existing refs use the remote tip; new
refs use the merge base with locally fetched `origin/main`. Without that
history the full suite runs. Deletion-only pushes need no source validation.
The hook prints the selected scope, outgoing HEAD, and final cleanliness result;
a failed selected check blocks the push.

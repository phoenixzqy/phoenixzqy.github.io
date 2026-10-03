# Scripted app releases

Run with Python 3.10+, Git, GitHub CLI authentication, the source repositories'
build toolchains, and Node.js matching the site's `.nvmrc`. Private Go modules
must be readable through the existing Git credential helper; no credentials
are embedded in commands, configuration or public metadata. Playwright's Linux
system dependencies must already be installed.

```sh
python3 -B scripts/app-release/release_apps.py
python3 -B scripts/app-release/release_apps.py --publish
python3 -B scripts/app-release/release_apps.py --publish --apps zai-gitter
```

The default checks for unpublished updates without building or writing to GitHub.
`--publish` authorizes builds, public release assets and website pushes. `--force`
requires explicit `--apps` and allocates a new version even if already current.

The approved adapters cover zai-cli, zai-editor, zai-gitter, zai-codex and BPlayer.
zai-claude-code and zai-design-system are excluded as release targets. A new
zai repository needs an explicit adapter before it can publish. Design-system
and bundled-tool revisions still participate in consumer update detection.

Every source revision comes from the authenticated remote's **default branch**,
never the local checkout branch. This selects `zai-codex` for the Codex fork.
Local clones under the configurable workspace directory provide Git object
caches. Each build uses a fresh disposable clone, fetches the remote branch,
and rejects a changed snapshot. Local branches and dirty worktrees are preserved.
A missing local clone falls back to the remote. All temporary clones and package
staging directories are removed when the invocation exits.

The source packagers and version allocation functions remain authoritative.
The source's full local validation runs before building. Go dependencies are
resolved from their remote default branches before building; the CLI's existing
refresh tool resolves them once and the build then uses those exact records.
No source branch or source tag is pushed. All public release tags target website
commits. Every final archive is inspected for debug maps, separate symbols,
unsafe paths and credential files, and checked against its manifest checksum.
Only explicitly listed final package assets are uploaded.

zai-codex builds only on its native host and requires `--codex-notices` pointing
to reviewed third-party notices. Native prerequisites and release verification
remain governed by the source's RELEASING.md and the site's Codex release guide.
Only the built target is advertised; existing other-platform assets are not
carried into a new source version. Dependency changes may require updated notice
review before an unattended release can proceed.

BPlayer dispatches the remote-default-branch Release workflow and verifies its
run, source revision and public downloads. It refuses to dispatch until the
upstream workflow contains debug-artifact sanitization. Remote workflows continue
if the local process is stopped; the next run resumes monitoring via its journal.
An uncertain dispatch is never blindly repeated.

Public assets become available before the manifest is pushed. The fresh site
clone installs its pre-push hook and dependencies, and every push runs the full
site suite. Concurrent website changes are fetched/rebased and validated; pushes
are never forced. Deployed manifest bytes and unauthenticated package hashes
are verified before reporting success.

Private journals and per-command logs live outside repositories under
`~/.local/state/app-release` by default (`--state-dir` overrides it). `runs/<id>/summary.json`
records each app's outcome, failing stage and log path. Each command has a
private `.command.json` record with argv, working directory, timestamps, timeout
and exit status; known environment secrets are redacted. stdout reports progress;
any incomplete app yields a nonzero exit. Builds and workflows have bounded
waits (`--timeout`), and cancellation terminates only owned local children.
A process lock serializes runs sharing the state directory.

An interrupted upload/publication keeps its app journal. The next invocation
reconciles the same tag and verifies downloaded assets instead of allocating a
duplicate release. Missing draft assets can be rebuilt only if the recorded source is still the
remote default tip and rebuilt bytes match the journal exactly; existing assets
are verified and never overwritten. A lost create response without a matching
release, different rebuilt bytes, or interrupted Codex installer synchronization
needs operator repair;
the script reports the exact journal rather than replacing versioned bytes or
deleting someone else's release. Published releases are never rolled back or
pruned. Keep the same state directory across scheduled invocations.

The script does not mirror changed user documentation or infer translated
release claims. Those still follow the documentation privacy review workflow.

After zai-cli's Script automation support is installed, preserve the existing
schedule/id and replace its prompt execution with:

```json
{
  "kind": "script",
  "command": "python3 -B scripts/app-release/release_apps.py --publish",
  "skip_log": false
}
```

Use `python` on Windows. Add the absolute reviewed Codex notice-directory option
in the local automation configuration when releasing Codex. zai must remain open
for scheduled execution; an OS scheduler can also invoke this command. Detailed
logs remain private and are never copied to the public site.

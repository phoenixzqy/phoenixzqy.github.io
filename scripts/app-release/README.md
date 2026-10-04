# Scripted app releases

Run with Python 3.10+, Git, GitHub CLI authentication, the source repositories'
build toolchains, and Node.js matching the site's `.nvmrc`. Private Go modules
must be readable through the existing Git credential helper; no credentials
are embedded in commands, configuration or public metadata. Playwright's Linux
system dependencies must already be installed.

On Windows, standard Node.js `npm.cmd` and `npx.cmd` launchers are resolved to
their adjacent `node_modules/npm/bin/npm-cli.js` and `npx-cli.js` and executed
directly with Node, without a shell. Unsupported wrapper layouts fail with an
explicit prerequisite error; install the standard Node.js toolchain.

```sh
python3 -B scripts/app-release/release_apps.py
python3 -B scripts/app-release/release_apps.py --publish
python3 -B scripts/app-release/release_apps.py --publish --apps zai-cli zai-editor zai-gitter --jobs 2
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
duplicate release. The creation response's release ID is saved before uploading;
subsequent reads use that ID even when GitHub's release list has not caught up.
A lost create response is reconciled by tag and exact source provenance.
Missing draft assets can be rebuilt only if the recorded source is still the
remote default tip and rebuilt bytes match the journal exactly; existing assets
are verified and never overwritten. A lost create response without a matching
release, different rebuilt bytes, or interrupted Codex installer synchronization
needs operator repair;
the script reports the exact journal rather than replacing versioned bytes or
deleting someone else's release. Published releases are never rolled back or
pruned. Keep the same state directory across scheduled invocations.

The script does not mirror changed user documentation or infer translated
release claims. Those still follow the documentation privacy review workflow.

### Recovering a failed or cancelled BPlayer workflow

A completed unsuccessful workflow records `workflow_terminal` in the private
`bplayer.json` journal, including its run ID, attempt, conclusion, URL and
observation time. The journal remains incomplete and retains dispatch intent.
Later invocations inspect that same run and never dispatch a replacement merely
because the source branch changed. A workflow failure can happen after packages
or website metadata were published; it is not evidence that nothing was written.

1. Stop scheduled invocations and wait for the state-directory process lock to
   be released. Preserve the journal and relevant private run logs. Inspect the
   recorded workflow URL, all job results and source revision; confirm the run
   is terminal and no related publication job or rerun remains active.
2. Reconcile the workflow's outputs with this public website repository: inspect
   its draft and published BPlayer releases, tag/version ownership and source
   provenance, the latest remote manifest, and deployed Pages metadata. Download
   every existing package for the attempt and verify its checksum, size, contents
   and signing status against the workflow's approved metadata. Include partial
   drafts and packages not yet referenced by the latest manifest. Preserve
   existing versioned bytes, releases and tags; never overwrite, delete or roll
   back published assets, and never downgrade a newer latest manifest.
3. If the same attempt can finish safely, repair its missing publication steps
   under the publishing contract. A GitHub rerun of the recorded run ID may be
   used only after verifying the selected jobs can reuse existing assets without
   replacing bytes or duplicating publication. A rerun uses the original source
   revision, so it does not pick up a later source fix. Keep the original journal
   and run ID, then invoke the script with the same state directory to resume
   monitoring and public verification. A successful rerun replaces the recorded
   terminal result with its new attempt and success conclusion.
4. If the attempt cannot resume (for example it requires a new source revision),
   first finish reconciliation: either confirm it created no public release/tag/
   assets/manifest change, or repair and verify everything it did publish and
   record any preserved partial draft for operator follow-up. Retain the exact
   versions and asset hashes as private evidence; the next attempt must allocate
   fresh versioned names for different bytes. Only after this review, with no
   publication still active, atomically move `bplayer.json` to a unique archived
   filename in the same private state directory. Do not simply delete the
   journal or clear `dispatch_intent`/`run_id`. A subsequent explicit invocation
   may dispatch a new attempt from the freshly discovered source default branch.

Uncertain release ownership, missing approved metadata, checksum differences or
an unreconciled partial publication require operator repair before either path.

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

## Parallel Go builds and combined publishing

zai-cli, zai-editor and zai-gitter validate and build in isolated clones with
two concurrent jobs by default. `--jobs 1` runs them sequentially; `--jobs 3`
permits all three at once. Each job has its own log directory under the run
report and bounded Go compiler/test parallelism (at most four processes per
job, reduced further for small CPU counts or a lower existing GOMAXPROCS).
All consumers resolve shared producer revisions before jobs start.

Only successfully validated packages are published. Public assets and their
downloaded checksums are verified serially, then successful Go manifests share
one website commit, full pre-push gate and Pages deployment. An app build
failure still permits successful apps to publish, while the run exits nonzero
and reports the failure. A combined website failure leaves every unfinished
app journal recoverable and stops later releases from using dirty site state.
A newer remote manifest is checked again before the combined commit.

Codex, BPlayer workflow dispatches and interrupted-publication recovery stay
sequential. Ctrl+C or termination cancels and joins owned workers before
temporary clones and staging are removed. Existing release locks, checksums,
source validation and website hooks still apply to every outgoing release.

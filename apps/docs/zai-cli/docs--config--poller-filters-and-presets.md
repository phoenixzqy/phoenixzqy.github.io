# Poller filters and presets

[Configuration index](?id=zai-cli&doc=docs--config) | Previous:
[Project registry and local project config](?id=zai-cli&doc=docs--config--project-registry) | Next:
[Configuration samples](?id=zai-cli&doc=docs--config--samples)

## Poller filter (`services.<service>.poller`)

A poller is a forge listing query plus fixed marker/lifecycle-role selection.
The top-level `label_prefix` changes those labels' shared branding, not their
roles or suffixes. Concrete label names below illustrate the default prefix;
`zai config show` reports the effective catalog for the active profile.
The `poller` block controls the configurable part — which items the listing
considers and which pull-request quality gates apply. The fixed
marker/lifecycle selection and claim-and-exclude mechanics
are never bypassed by any filter, so concurrency-safety and forge-state
invariants always hold.

| Field | Applies to | Default (per service) | Meaning |
| --- | --- | --- | --- |
| `scope` | all services | `assigned` (dev, review) / `authored` (pr-babysitter) | `assigned` (items assigned to / requesting review from you; GitHub includes verified team membership, while ADO review includes only direct assignments plus verified `ado_reviewer_groups`), `authored` (items you created), or `all` (every marker-labeled item). Review-service includes your own PRs in `all` and `authored`; its default `assigned` scope excludes them. |
| `include_drafts` | review, pr-babysitter | service preset (`false`) | Optional tri-state gate. Omit for the built-in preset, `true` to include draft pull requests, or `false` to skip drafts. Ignored for `dev` (polls issues/work items), which has no draft state; the config editor does not show it there. |
| `require_checks_passing` | review | service preset (`false`) | Optional tri-state gate. Omit for the built-in preset, `true` to require passing checks (for example to restore the old review require-green behavior), or `false` to allow failing/unknown checks. Ignored for `dev` and `pr-babysitter` — pr-babysitter exists to fix failing checks, so it never drops a pull request for them; the config editor does not show it for those services. |

An unknown `scope` value is rejected before the poller calls the forge; it is
never silently widened or remapped to another relationship.

For a single-contributor repository, set review scope to `all` or `authored`;
pr-babysitter can retain its default `authored` scope. GitHub forbids native
self-approval, so a successful approving review uses `zai-approved` plus a
wrapper-confirmed `zai-approved-head` receipt in the review comment.
Babysitting accepts native approval or this fallback only when the latest own
review's receipt and review-head marker match the current head. A newer review
without a receipt, a changed head, or `zai-need-review` invalidates the fallback;
`no_vote` removes its label. Bare labels never authorize merge. The forge still
enforces required independent approvals, checks, and branch rules without bypass.
Before a forced GitHub review consumes `zai-need-review`, the poller or
command-mode claim verifies live self-ownership and removes any prior fallback
label, with readback. Failure aborts the claim without consuming the override;
failure or cancellation before the new review is published cannot revive the
old approval. Labels on other-authored PRs are left alone. Receipt publication
uses verified delivery account/head evidence and rechecks ownership with scoped
credentials, rather than trusting the selection-time self-author flag.
Explicit command-mode reviews invalidate prior self-approval even without the
override label. When invalidation fails without that durable exclusion, the
reviewing claim is retained and an error is reported; no agent starts.
ADO continues using native votes, subject to its creator-vote policy.

Babysitting also recognizes review-service comments from the same account.
Unanswered GitHub review comments require their own handled-comment marker;
ordinary own service summaries do not trigger another pass. Merely acknowledging
a clean approving review must not request another review.

For ADO review, assigned scope performs one direct `--reviewer <user>` listing
plus only configured entries uniquely resolved against signed-in-user
memberships. GUID entries match only resolved group IDs; display names match
exact case-insensitive `providerDisplayName` first, or, when unqualified, the
leaf after stripping bounded leading `[scope]\` qualifiers from that provider
value, never Account, substring, or fuzzy aliases. The poller lists each selected group by its resolved GUID,
deduplicates name/GUID aliases, and skips unmatched or ambiguous entries with
identifier-free diagnostics. Empty configuration is direct-only and diagnostic. The poller never
uses the dev service's saved work-item `query_id`, never submits every resolved
membership as a reviewer, and never performs an unfiltered active listing for
group discovery.

Review de-dup is always on and not configurable: the review poller always skips
a pull request it has already reviewed at its current head SHA, so unchanged
pull requests are never re-reviewed. (An earlier `require_needs_review` knob is
removed; any value still present in an existing config is ignored on load.)

Pr-babysitter de-dup and no-progress guard are always on and not configurable:
after acting on a pull request the pr-babysitter agent posts a durable babysit
marker (a GitHub comment or ADO thread) recording the head SHA it acted on, an
attempt timestamp, an attempt counter, and a fingerprint of the actionable state
(the unresolved-thread set plus the CI/conflict conclusion). On later rounds the
poller skips a pull request whose head SHA and fingerprint are unchanged since
the last marker, so the agent is never re-dispatched to redo the same work; a
new commit or a changed blocker at the same head still re-selects it. A short
cooldown prevents re-dispatching the same head while an agent's push is still
landing, and after a fixed number of attempts at one head with the blocker still
present the poller applies `zai-blocked` instead of dispatching
another run, so a pull request the agent cannot make progress on stops looping
and waits for a human. As a human-driven, one-shot escape hatch, applying the
`zai-need-babysit` label to a pull request forces the poller to
dispatch it for at least one babysit run regardless of this guard and the
actionability check (the claim and open/draft filters still apply); the
pr-babysitter agent removes the label after acting and records the human
intervention in the run record. This is fixed
behavior, not a configurable gate.

Independently, the pr-babysitter agent applies the `zai-need-review`
label to a pull request when a babysit pass handled review comments but produced
no new commit on the pull request head. The review-service poller then includes
that pull request regardless of its always-on head-SHA de-dup and the draft and
checks skip gates (the claim, blocked, and conflict gates still apply) — so the
resolved-but-uncommitted feedback loop does not stall. The poller consumes
the label under its claim before starting the review, so even an interrupted
run does not force-re-review indefinitely. This too is fixed behavior, not a configurable
gate.

**Tri-state gate rule:** each gate is optional. Omitted means "Default" in the
config editor: use the service's built-in preset value. Explicit `true` means
"On" and explicit `false` means "Off". `scope` is still configured separately;
when it is omitted or empty, the service's default scope is used.

### Preset combinations

- **default** — zai's built-in selection: `dev`/`review` act on items
  assigned to you; `pr-babysitter` acts on your own pull requests; `review`
  skips drafts. `review` also always skips pull
  requests already reviewed at their current head (always-on de-dup, not a
  configurable gate).
- **all** — `scope: all` for a service, so it acts on every marker-labeled item
  regardless of who it is assigned to or authored by (for example review all
  pull requests, or babysit all pull requests). With no gates set it is
  labels-only.

> **Scale note:** `scope: all` lists every candidate the forge returns before
> filtering by the marker label. On GitHub the marker is pushed into
> `gh ... --label`, so `all` stays cheap even on large repositories. On Azure
> DevOps there is no server-side label filter, so `all` pages the entire
> repository's active pull requests and filters in memory — impractical on a
> large monorepo. Prefer `assigned`/`authored` there.

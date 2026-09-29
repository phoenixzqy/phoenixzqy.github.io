# Configuration samples

To replace label branding for a team or project, add this top-level setting:

```json
{
  "label_prefix": "team"
}
```

This is a partial config fragment, not a complete config. It resolves marker
`team`, ready label `team-ready`, and every other lifecycle label with the same
fixed suffix. Omit it to retain `zai`. Follow the migration chapter before
changing a namespace that already has work in progress.

[Configuration index](?id=zai-cli&doc=docs--config) | Previous:
[Poller filters and presets](?id=zai-cli&doc=docs--config--poller-filters-and-presets) | Next:
[Validation and boundaries](?id=zai-cli&doc=docs--config--validation-and-boundaries)

## Samples

Default combination (the built-in selection):

```jsonc
{
  "schema_version": 26,
  "repo": { "forge": "github", "full_name": "acme/widgets", "repo": "widgets" },
  "poll_interval_seconds": 60,
  "working_directory": ".",
  "max_total_agents": 10,
  "notifications_enabled": true,
  "label_prefix": "zai",
  "services": {
    "dev":           { "model": "auto", "agent_name": "", "agent_limit": 3, "agent_timeout_minutes": 360, "poller": { "scope": "assigned" } },
    "review":        { "model": "auto", "agent_limit": 4, "agent_timeout_minutes": 360, "review_vote": "default", "max_group_reviewers": 3, "poller": { "scope": "assigned" } },
    "pr-babysitter": { "model": "auto", "agent_limit": 4, "agent_timeout_minutes": 360, "poller": { "scope": "authored" } },
    "housekeep":     { "model": "auto", "agent_name": "", "agent_timeout_minutes": 360, "interval_seconds": 10800, "detect_maintained_branches": true, "sync_maintained_branches": true, "cleanup_stale_worktrees": false, "cleanup_stale_branches": false, "cleanup_logs": false }
  }
}
```

"All" combination — poll all work items, review all PRs, babysit all PRs
(labels-only). This ADO example stores work items in a separate project:

```jsonc
{
  "schema_version": 26,
  "repo": {
    "forge": "ado",
    "organization": "https://dev.azure.com/example",
    "project": "Project",
    "repo": "Repository"
  },
  "poll_interval_seconds": 60,
  "working_directory": "packages/application",
  "max_total_agents": 10,
  "notifications_enabled": true,
  "label_prefix": "zai",
  "services": {
    "dev":           { "model": "gpt-5.5", "agent_name": "repository-dev-agent", "agent_limit": 3, "agent_timeout_minutes": 360, "work_item_project": "Planning", "query_id": "a1b2c3d4-0000-0000-0000-000000000000", "poller": { "scope": "all" } },
    "review":        { "model": "gpt-5.5", "agent_limit": 4, "agent_timeout_minutes": 360, "review_vote": "default", "max_group_reviewers": 3, "poller": { "scope": "all", "include_drafts": true, "require_checks_passing": false } },
    "pr-babysitter": { "model": "gpt-5.5", "agent_limit": 4, "agent_timeout_minutes": 360, "poller": { "scope": "all", "include_drafts": true } },
    "housekeep":     { "model": "gpt-5.5", "agent_name": "repository-housekeep-agent", "agent_timeout_minutes": 360, "interval_seconds": 10800, "maintained_branches": ["dev", "release/*"], "detect_maintained_branches": false }
  }
}
```

ADO assigned review with an explicit reviewer-group allowlist:

```jsonc
{
  "schema_version": 26,
  "repo": {
    "forge": "ado",
    "organization": "https://dev.azure.com/example",
    "project": "Project",
    "repo": "Repository"
  },
  "services": {
    "review": {
      "model": "gpt-5.6-sol",
      "agent_limit": 4,
      "agent_timeout_minutes": 360,
      "review_vote": "default",
      "max_group_reviewers": 3,
      "ado_reviewer_groups": ["Platform Reviewers", "11111111-1111-1111-1111-111111111111"],
      "poller": {"scope": "assigned"}
    }
  }
}
```

The direct user is always queried. Display names resolve by exact
case-insensitive `providerDisplayName`, or, when unqualified, the leaf after
stripping bounded leading `[scope]\` qualifiers from that provider value;
GUIDs resolve only against membership IDs. Unique matches are queried by resolved GUID, while unmatched or ambiguous
entries are skipped with identifier-free diagnostics. Omitting the list keeps
ADO review direct-only and produces a structured migration warning.

Namespaced combination — set `custom_required_labels` so a second, differently
labeled workflow can run against the same repository. Only the relevant top-level
excerpt is shown; the `services` block is unchanged from the samples above:

```jsonc
{
  "schema_version": 26,
  "repo": { "forge": "github", "full_name": "acme/widgets", "repo": "widgets" },
  "poll_interval_seconds": 60,
  "custom_required_labels": "workflow-a",
  "services": { }
}
```

With this set, every poller service additionally requires `workflow-a`
(the ADO dev work-item poller is the exception — it selects through its saved
query), a dev-created Code pull request carries it so the downstream review
and pr-babysitter pollers can select it, and `zai start`
provisions the label on GitHub if it is missing. When you author work through the
console `zai-create-work-item` skill, it reads this value from
`zai config show` and offers a separate, recommended choice to stamp the
configured custom labels onto the new item or stack (an independent opt-out from
the workflow-label choice), so newly created items land inside the
namespace the dev poller selects on.

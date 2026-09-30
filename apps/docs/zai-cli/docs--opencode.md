# OpenCode integration

OpenCode is available as a coding-agent provider for the console, all four
background services, and console automations. Requires **OpenCode 1.18.33+**.

Open zai and choose **OpenCode** from the app picker. The official `opencode-ai`
npm package is installed only when missing; an existing executable is
version-checked, not replaced. Node.js/npm is needed for this installation
route. You can also use OpenCode's official native installation.

## Configuration and authentication

Set `"coding_agent": "opencode"` in project configuration. The alias `"oc"`
also resolves to OpenCode; omission still selects Copilot. Service models use
native `provider/model` identifiers; `auto` and `default` omit a model override.
Restart services and reopen the console after changing the selected provider.
OpenCode's native model picker shows the locally available catalog; catalog
membership does not prove your account is entitled to use a model.

The managed home is `~/.zai/.opencode`. Native configuration, credentials,
session database, state, and cache remain inside it. OpenCode and XDG path
variables are scoped only to the child. Personal OpenCode state is never copied
or modified. Use `/connect` inside the hosted OpenCode session to authenticate
this managed home separately.
Existing provider API environment variables remain inherited. A provider can
still reject expired credentials or an unavailable model when the run starts.

Store native preferences, provider definitions, MCP servers, and plugins in
the managed home's `opencode.json` or the repository's native OpenCode config.
Do not edit generated agents, skills, global instructions, or the lifecycle
plugin: a changed package-owned file produces an explicit refresh conflict.
Global configuration also exists beneath `config/opencode` inside the managed
home; OpenCode's native precedence applies. Sharing is disabled for hosted
sessions. Provider credentials, private prompts, and complete environments are
not copied into diagnostic logs.

## Workflow compatibility

| Surface | OpenCode behavior |
| --- | --- |
| Console | Same tabs, splits, project/worktree selection, rails, and explicit Ask AI handoff. |
| Permissions | Normal interactive approvals; console YOLO adds `--auto`. Services use `run --format json --auto`. Explicit native denials remain effective. |
| Services | Dev, investigation, review, PR babysitting, and housekeeping retain the shared forge selection, final validation, and delivery rules. |
| Automations | Uses the project's selected provider; recorded run identities resolve back to native sessions for resume. Without YOLO, unattended permission requests are rejected rather than silently approved. |
| Global instructions | Derived into OpenCode's native instruction entry point from the same packaged source for every launch. |
| Skills and agents | Packaged definitions become native agents, usable as primary agents or subagents; skills retain names and support files. |
| Repository guidance | Imports the repository's Copilot-compatible instructions, scoped rules, agents, and skills along the working-directory ancestry, alongside native OpenCode resources. |
| Sessions | Reads root and child sessions across projects through a fixed, read-only native database query; selecting a child resumes its parent. |
| Status and worktrees | Native plugin events bind root/child session IDs to a live launcher and report running, waiting, and done states. |
| Completion | A correlated native final `stop` step plus a clean process exit is required. Missing, malformed, truncated, mismatched, or interrupted evidence never becomes success. |
| Stop hooks | No blocking agent-stop/subagent-stop equivalent. Explicit worktree release and shared wrapper review/result validation remain authoritative; no native pre-stop draft repair is claimed. |
| Extensions | Native OpenCode plugins, tools, and MCP configuration, not Copilot marketplace/plugin compatibility. |
| Analysis | `session:analyze` remains Copilot-only. |

Imported skills use nearest-ancestor precedence; duplicates at the same level
are rejected. Repository agents cannot replace managed agent names. Compatibility
agents with provider-specific frontmatter fail rather than silently lose their
settings; use a native `.opencode/agents` definition for those fields.
Subagent model and reasoning choices remain native/user-owned.

Each launch snapshots imported repository resources outside the checkout.
Restart the session to pick up resource changes. Managed package resources
cannot refresh while a session is live; close those sessions and retry.
Discovery rejects linked resources, path escapes, ambiguous names, and oversized
resource sets. Native OpenCode resources keep OpenCode's own trust and discovery
semantics.

Native session databases and caches remain OpenCode-owned; zai does not delete
them during log cleanup. Opt-in housekeeping bounds old diagnostic logs and
zai-owned stream evidence, preserving live or uncertain launchers.
Catalog reads stop with an explicit error above 1,000 sessions rather than
silently showing an incomplete history. Native database schema compatibility is
part of the versioned adapter contract.

## Native differences and verification

OpenCode's custom config directory alone does not isolate all state. The adapter
also redirects XDG storage and uses the version-gated native home override for
personal compatibility discovery, without replacing `HOME` for repository
commands. Its shell-environment hook restores inherited XDG values for commands
run by the agent; when a value was originally unset, the final spawned tool
process receives it as unset rather than inheriting the managed OpenCode
directory. This preserves native paths for tools such as forge CLIs on Windows.

OpenCode's lifecycle plugin is event-driven, uses direct-exec helper calls with
a ten-second deadline, and loads no external dependency. Identity binding
failures are errors; optional console-status transport failures are diagnostic
only. A crashed launcher's identities expire through process-liveness checks;
uncertain liveness preserves claims rather than authorizing cleanup.

An authenticated live-model run and native Windows/macOS terminal checks are
separate from deterministic local adapter tests. Do not interpret compilation
or a mock provider as evidence that a particular account, model, or platform
has been validated.

Native references: [CLI](https://opencode.ai/docs/cli/),
[configuration](https://opencode.ai/docs/config/),
[plugins](https://opencode.ai/docs/plugins/), and
[v1.18.33 source](https://github.com/anomalyco/opencode/tree/v1.18.33).

# Claude Code

Claude Code is a coding-agent provider in the zai console and delivery services.
It uses the same project workspace, tabs, vertical/horizontal splits, rails,
Ask AI handoff, live status, managed worktrees, and service result validation.

## Install and authenticate

Install the official `@anthropic-ai/claude-code` package or use its native
installer, then open zai and choose Claude Code from the app picker. An existing installation is checked, not silently replaced. Claude Code
2.1.281 or newer is required. For an older installation, update it using its
original installation method. Selecting Claude Code offers the missing CLI's
installation path. Authentication can require a browser and an eligible Claude
account; signing into Copilot does not authenticate Claude.

The managed home is `<zai-install>/.claude` (normally `~/.zai/.claude`).
`CLAUDE_CONFIG_DIR` is set only on child processes. Personal `~/.claude`
credentials, trust decisions, settings, and history are never copied or changed.
Existing provider API environment variables are inherited.

For a separate test installation, invoke **that installation's executable** for
both authentication and launch; its Claude home is separate from production.

## Services and automations

Set the project's **Coding agent** field to `claude`, or use:

```json
{
  "coding_agent": "claude"
}
```

The selection covers dev, review, pr-babysitter, and housekeep, including direct
`agent:run` and repository harness evaluation. Restart the daemon after changing
its provider. Reopen the console to rebuild its automation schedulers after
changing the provider in an existing profile. Existing automation history retains
the provider that created each run; resuming an old run does not send its session
ID to the newly selected provider. Old history without attribution uses the
previous default provider.

Service models `auto` and `default` defer to Claude. Native aliases `opus`,
`sonnet`, `haiku`, and explicit deployment-specific IDs are supported. The picker
is an alias list, not a live account-entitlement catalog. Copilot model IDs and
billing units are not interchangeable with Claude's.

Service runs are unattended and bypass permission prompts. Console sessions
retain normal approvals unless the project's resolved console YOLO setting is
enabled. Automations never ask questions; they bypass permissions only when
console YOLO is enabled. Without it, a disallowed operation fails rather than
waiting for a human. zai does not enforce a Claude subagent model or reasoning
effort; those choices remain under Claude's native and user configuration.

Completion requires Claude's successful, correlated stream result **and** a
successful process exit. A zero exit, truncated output, or a success event
followed by failure is not completion. Shared final-comment and review-vote
validation remains authoritative; a review Stop hook can request a repair turn.

## Instructions, skills, and agents

The packaged runtime's reusable agents, skills, tools, schemas, and global
instructions are translated into the managed Claude home. The source remains
the installed reusable runtime, not a second independent prompt distribution.
Refreshes preserve runtime settings, credentials, and transcripts. A conflicting
local edit is reported rather than overwritten, and resource changes wait until
managed sessions have stopped.

Discovery uses the pane's final working directory, including worktrees and
nested repository folders. Claude keeps its native instruction, agent, skill,
and plugin behavior. Compatibility resources include repository-owned global
and scoped instructions, reusable skills, and agent definitions.

Imported scoped instructions retain their file-matching condition. Skills are
snapshotted outside the checkout with logical-name collision checks and
nearer-folder precedence. Nearer and native agent definitions take precedence
over managed definitions. The installed CLI guide describes resource discovery;
keep project-specific rules in the project rather than duplicating them in the
installation.

Imported repository agents and managed packaged agents retain their unprefixed
names in both interactive and unattended modes.
Compatibility translation carries the agent's name, description, and prompt.
Tool restrictions, permission modes, MCP configuration, and hooks in a
compatibility definition cause an explicit error rather than being discarded;
configure them in a native `.claude/agents` definition instead. Other
provider-specific frontmatter is not translated.
Native `.claude` agent restrictions are left intact.

Repository instruction and skill discovery accepts relative symlinks that stay
inside the checkout, including shared skill-directory aliases and links to
plugin-owned skills. Aliases to the same skill directory at one ancestor are
scanned once; distinct directories with duplicate logical names remain errors.
Escaping links, directory cycles, non-regular files, and oversized resources fail
at launch rather than silently omitting instructions. Managed-home resources and
agent definitions retain their stricter no-symlink policy.

## Sessions and lifecycle

The Sessions rail includes managed interactive and service sessions, groups
subagents with their parent, and resumes sessions through Claude's native resume
command. Selecting a subagent reopens its parent session: Claude resumes a
subagent through that parent, not as a standalone top-level conversation.
Titles use the first user prompt, whether stored as a string or as text blocks;
image and tool-result blocks are ignored. A custom session name takes precedence.

Lifecycle hooks report running, waiting, and done state, publish live session
identities for worktree ownership, and ask subagents to release their own claims
before completing. Closing a launcher removes its owned root and child liveness
marks; it does not force-release worktrees or delete retained work. Native
transcripts and captured evidence participate in the existing age-based
retention policy while live sessions are protected.

Claude session discovery, native resume, and service evidence remain available.
Copilot plugins, login state, and
Copilot-specific billing are not imported.

## Manual acceptance checks

Authenticate in the test installation before checking model-backed behavior.
Open Claude from the app picker, then check new tabs and both split directions.
Verify status transitions on a prompt, a question, a tool
permission request, a delegated task, and completion.

Open a managed worktree and a nested folder, check that their own instructions
and skills are loaded, and try Ask AI from the editor and Diff Review. Resume an
interactive session and a service-created session. With a disposable project
configured for Claude, exercise each service and one manual automation; inspect
the resulting logs, drafts, and session attribution. Cancel a long operation and
confirm no child process or live-session marker remains. Repeat with console
YOLO off and on; normal interactive launches must not silently bypass approvals.

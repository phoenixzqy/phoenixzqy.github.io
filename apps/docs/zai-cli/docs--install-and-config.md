# AI-guided install and configuration

## Give these instructions to your AI

This guide lives in the repository. An AI tool may not have repository access,
so copy the instructions if it cannot read your checkout or the GitHub page.

1. Open `docs/install-and-config.md` in your checkout or on GitHub.
2. Copy everything from **Instructions to paste into AI** below through the end of the page.
3. Start Copilot CLI, then paste the copied text into the conversation with the request below. Share only the guide instructions, never passwords, tokens, or browser cookies.

```bash
copilot --yolo
```

```text
Use the following instructions to install zai and configure my repositories:

[Paste the copied guide instructions here.]
```

## Instructions to paste into AI

Install zai and onboard the repositories the human names by following
the steps below. Use this supplied text directly; do not require fetching this
page again. If a linked reference is inaccessible behind SSO, ask the human to
open it in their browser and paste the relevant instructions. Do not ask for
sign-in credentials, tokens, or browser cookies.

After setup, point the human at the installed CLI for ongoing usage.

## Prime directive: the installed CLI is the source of truth

This page tells you **which command to run and which question to ask**. It
deliberately does not restate command flags, config fields, defaults, labels, or
workflows, because the installed build already documents them and this page
would drift away from it.

After the install succeeds, read the installed documentation and treat it as
authoritative for every later decision:

```bash
zai doc            # the full guide: config, services, console, labels
zai -h             # command summary
zai <command> -h   # exact flags for one command
```

If this page and `zai doc` ever disagree, `zai doc` wins.

## Step 1 — check the prerequisites

You are already running inside Copilot CLI, so confirm the rest: `git` works and the runtime prerequisites listed in the [getting-started guide's installation section](?id=zai-cli&doc=docs--getting-started#installation) are present.

Report anything missing to the human and let them decide rather than guessing at a fix.

## Step 2 — install

Run the single-line installer command for the human's platform. It removes its
temporary download on success or failure and leaves the current directory clean.

macOS / Linux:

```bash
(installer=$(mktemp) || exit; trap 'rm -f -- "$installer"' EXIT; curl --proto '=https' --proto-redir '=https' -fsSL https://phoenixzqy.github.io/install/zai-cli.sh -o "$installer" && sh "$installer")
```

Windows PowerShell:

```powershell
irm https://phoenixzqy.github.io/install/zai-cli.ps1 | iex
```

This is the public release installer. It needs no GitHub sign-in, token, or
repository access: it reads the published manifest over anonymous HTTPS and
verifies the downloaded archive's SHA-256 before installing it. Never embed a
token in an installer or image.

## Step 3 — verify the install

```bash
zai version
```

The installer adds the install directory to the user's persistent `PATH`, which
does not affect the shell you are already in. If the command is not found, use
the full path to the installed binary for the rest of this session and tell the
human to open a new terminal afterwards.

## Step 4 — read the installed documentation

Run `zai doc` now and keep its output in mind for the remaining steps.
It is where the config file shape, the poller settings, the service model, the
label catalog, and the console workflow are actually specified.

## Step 5 — ask which repositories to onboard

Configuration is **per repository**, so ask the human which repositories they
want zai to work on:

> Which repository would you like to onboard? Please paste its absolute local
> path. You can list several, one per line.

Ask for paths. **Do not scan the disk for repositories** — it is slow, it reads
directories the human did not offer you, and it produces a list they then have
to filter anyway.

Validate each answer before continuing: the path must exist and
`git -C <path> remote get-url origin` must resolve to a GitHub or Azure DevOps
remote. If it does not, say so and ask again.

## Step 6 — ask the model for each repository

For each repository the human named, ask which coding model its services should
use:

> Which model should zai use for `<repo>`? `auto` lets the coding
> agent pick per run, or name a specific model id.

Recommend `auto` unless they have a reason to pin one. Ask once per repository —
a heavy repository and a small one often deserve different answers. Use one
answer for all four services unless the human asks to differentiate.

## Step 7 — write the config file

Do **not** run `zai config init`: it opens an interactive TUI you
cannot drive. Follow the "Onboard a repository without the interactive editor"
section of `zai doc` instead. In short, for each repository:

1. `cd` into the repository.
2. Run `zai config path` to get the file to write, and
   `zai config show` to get the detected repo identity.
3. Write that file, using the minimal config shape from `zai doc` with
   the repo identity from step 2 and the model from step 6.

The file lands under `~/.zai/configs/`, in the zai home. It
never goes inside the repository, so onboarding leaves the repository's working
tree clean — confirm that with `git status` before moving on.

## Step 8 — verify and hand off

From each repository, confirm the config loads:

```bash
zai config show
```

It reports `initialized=true` and fails loudly on a bad value. Fix and re-run
until it loads.

Then tell the human what they now have, and point them at the CLI rather than
repeating it yourself:

- `zai start all` runs the services for the repository you are in.
- `zai copilot` opens the console TUI on the same harness.
- `zai doc` documents everything else, including how to change the
  configuration you just created.

For console users, confirm the activity controls are readable. Built-in images
or the automatic `S`, `T`, `G`, `>_` text fallback are both expected. Do not ask
the human to install fonts or change terminal profiles.

## Related documentation

- [`getting-started.md`](?id=zai-cli&doc=docs--getting-started) — installation, updates, and the
  command table.
- [`config.md`](?id=zai-cli&doc=docs--config) — the full per-repository configuration reference.
- `architecture.md` — what the services do and how they fit
  together.
- `testing-and-operations.md` — operating and
  debugging an install.

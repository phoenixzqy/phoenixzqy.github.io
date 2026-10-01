# Project registry and local project config

[Configuration index](?id=zai-cli&doc=docs--config) | Previous:
Configuration field reference | Next:
[Poller filters and presets](?id=zai-cli&doc=docs--config--poller-filters-and-presets)

The interactive console stores registered projects in `~/.zai/projects.json`.
Entries are ordered by the user and have one of three kinds:

- `forge`: a Git repository on GitHub or Azure DevOps. Its identity is the
  canonical forge repository identity that also names its config directory, so
  clones, linked worktrees, and equivalent remote spellings of one repository
  share one project.
- `git`: a Git repository without a supported forge remote.
- `directory`: a plain folder.

Forge projects use the established service config directory
`~/.zai/configs/<repo-slug>/` and may run services. Git projects have worktrees
but no services. Directory projects have neither services nor worktrees.

Non-forge projects retain a minimal compatibility config in
`~/.zai/configs/_project-<name>-<12-hex-sha256-prefix>/config.json`. The local project
id starts with `_project-`, includes a sanitized path basename, and ends with the
first six bytes of a SHA-256 digest of the normalized root path. The file shape
is:

```json
{
  "schema_version": 1
}
```

`console_yolo` is an optional override of the app-wide toggle: absent (the
default) inherits, `true` or `false` wins for launches this project owns. The
legacy `console_scrollback_lines` field remains on disk for compatibility but no
longer affects console launches. App **Settings** on the left rail owns the
app-wide preferences, alongside themes. The non-forge Project config page edits
only this project's YOLO override (`Inherit`/`On`/`Off`).

The registry is seeded once from service history and existing forge configs; a
checkout recorded by service history is normalized to its repository's main
working tree. Adding a project in the console opens the Projects panel's **+ Add Project**
folder browser, validates an absolute path (expanding a leading `~`), optionally
creates a missing selected folder after confirmation (or a named folder made
with **New folder**), and registers the path. Registration persists missing
default config for every project kind: service defaults for forge projects and
minimal local settings for git and directory projects. Existing settings and
active profiles are preserved, including on repeat registration; invalid files
and missing selected named profiles remain errors. Adding a project in the
console opens its Config right rail for review, including repeat registration. Registry order is the Projects
panel order; Shift+Up/Shift+Down in the panel rewrite it.
Projects migrated without a known location show "location unknown; open to
locate it"; opening that project, or one whose folder is missing, opens
**Locate <name>** to bind its folder. `zai start` records a forge project when
services run. Removing a project can unregister it while keeping files, or
delete both the project's config directory and folder after the deletion
safeguards described in the architecture project model.

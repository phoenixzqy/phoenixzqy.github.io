# Benchmarks

Documentation index

Footprint measurements of zai and three alternatives, all taken on the same
machine on 2026-09-28. The README comparison is based on these numbers. This
page reports every result, including the ones where zai does not win.

## Results

### Disk and download size

| App | Version | Distributed as | Download | On disk |
| --- | --- | --- | --- | --- |
| zai | `main` at `322a28d` | Package directory (built locally) | n/a | 89.5 MB |
| VS Code | 1.139.1 | Linux x64 `.tar.gz` | 341.8 MB | 1,007.7 MB |
| Orca | 1.4.216 | Linux AppImage | 216.7 MB | 610.3 MB (extracted) |
| herdr | 0.9.1 | Single binary | 26.2 MB | 26.2 MB |

zai's package contains four executables: `zai` (44.4 MB), `zai-editor`
(27.2 MB), `zai-gitter` (9.1 MB), and `zai-hook` (3.8 MB). It does not contain
the coding-agent CLIs it launches (Copilot CLI or Pi); install those separately.
zai has no published release archive yet, so there is no download size.

### Idle memory and CPU

Each app was left idle for 60 seconds and sampled once per second. Memory is the
endpoint PSS summed across the app's process tree, so shared pages are counted
once. CPU is the average over the window, as a percentage of one logical CPU.

| App | Idle state | Processes | PSS | CPU (steady) | CPU (first window) |
| --- | --- | --- | --- | --- | --- |
| zai | Console, one project, Welcome tab, no agent | 1 | 38.1–38.8 MiB | 1.6–1.9% | 1.9% |
| VS Code | Fresh profile, no extensions, one folder open | 13 | 745.9 MiB | ≥ 7.1% | ≥ 49.1% |
| Orca | Fresh profile, first-run screen | 8 | 541.1–544.6 MiB | 0.3% | ≥ 14.8% |
| herdr | One pane running `bash` | 3 | 22.8–22.9 MiB | 0.5–0.6% | 0.6% |

- zai was sampled three times. Its three runs used 1.93%, 1.57%, and 1.67% CPU.
- herdr was sampled three times.
- VS Code and Orca were each sampled twice, back to back. The first window
  includes startup work. The second window is the steady figure.
- "≥" marks a lower bound: CPU used by child processes that start or exit
  between samples is not counted.

### Summary

- **Against VS Code:** zai uses about 19× less memory and 11× less disk, and
  less idle CPU.
- **Against Orca:** zai uses about 14× less memory and 7× less disk. Orca's
  steady idle CPU is lower than zai's.
- **Against herdr:** herdr is smaller and lighter on memory and CPU. herdr is a
  terminal multiplexer for agents. It has no editor, diff review, LSP, or
  issue-to-pull-request services, and zai ships all four.

## Environment

- Linux x86_64 under WSL2, kernel `6.18.33.2-microsoft-standard-WSL2`.
- 16 logical CPUs, 32 GB RAM.
- GUI apps (VS Code, Orca) ran through WSLg.
- Terminal apps (zai, herdr) ran headless in `tmux` at 160×48.
- Every app ran with a fresh, isolated profile or home directory. VS Code used
  fresh `--user-data-dir` and `--extensions-dir` directories. Orca ran with
  `--no-sandbox`.

## Method

Sizes are byte counts of the downloaded artifact and of the unpacked install
tree.

The zai package was built with:

```text
python3 src/scripts/build-and-install.py --build-only --locked-tools --clean --output-dir <dir>
```

Idle samples used the
`performance-measurement`
skill's sampler, pointed at the app's root process:

```text
python3 .github/skills/performance-measurement/scripts/measure.py sample --pid <root-pid> --duration 60 --interval 1 --full-memory --output <file>.json
```

## Limits

- These are idle measurements. They do not measure agent workloads, typing
  latency, large repositories, or startup time.
- Results depend on the machine, the OS, and the app version. Re-measure before
  quoting them in a different context.
- A GUI app's idle cost under WSLg may differ from a native desktop.
- Each app was measured in its own natural idle state (see the table), so the
  states are comparable but not identical.

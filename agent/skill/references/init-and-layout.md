# Initialize and layout

## Existing repository

Run this from the repository root, only after the user agrees:

```bash
repoos init
```

Init does not overwrite an existing file. With the default `repoos/` layout it creates:

| Path | What it is |
| --- | --- |
| `repoos.toml` | Configuration. Every field is optional. Always at the repo root. |
| `repoos/work/` | One markdown file per task. This is the board. Includes `0001-set-up-repoos.md` (a `done` example) and an inbox starter task. |
| `repoos/docs/` | Context an agent needs to work on *this* project — architecture notes, decisions, history. |
| `AGENTS.md` | Instructions agents read first. The cross-tool standard; Claude Code, Codex, Cursor, Aider and Zed all read it. Always at the repo root. |
| `.env.example` | Names of secrets a fuller setup expects. No values. |
| `.gitignore` | Created, or appended when one already exists. Ignores the derived cache, root `.repoos/` runtime state, `.env`, `.env*.local`, `node_modules/`, task and input attachment directories, and `.DS_Store`. |
| `repoos/.repoos/canary.txt` | Tracked canary counter. |

A new project also runs `git init` and, unless you pass `--no-commit`, commits
the scaffold (`chore: initialize RepoOS project`). Init in an existing repo
does not make that commit.

A fresh install defaults to the namespaced `repoos/` layout. The config it writes
sets `workDir = "repoos/work"`, `docsDir = "repoos/docs"`, and the matching
`skillsDir`, `storiesDir`, `inputsDir`, `schedulesDir`, `remindersDir`, and
`cacheDir` under `repoos/`. In an interactive run you can choose the repository
root or another namespace instead; in the new-project flow the `--layout` flag
picks it. Root-layout projects keep `work/` and `docs/` next to `AGENTS.md` and
`repoos.toml`.

`repoos init` is idempotent: it skips files that already exist, so re-running it
is safe. It also adds the derived cache, local `.env` files, `node_modules/`,
and task/input attachment directories to `.gitignore`. It seeds an `inbox`
starter task as a suggestion, not work that auto-runs.

## Start the board

Before `repoos serve`, check which agents are enabled in `repoos.toml`. A
project with no `[[agents]]` rows uses the built-in defaults.

```bash
repoos serve
```

Serve starts the local server and background automation. The CTO board monitor
ticks every 5 minutes (`ctoMonitorIntervalMs`, default `300000`). When the
`cto` agent has `enabled = true`, that tick launches a coding agent. Turn it
off with `enabled = false` on that `[[agents]]` row. The built-in default
leaves the CTO disabled. The reviewer is on by default and starts when a task
enters `review`. The watchdog (`watchdog.enabled`, default `true`) can restart
a stalled engineer.

The command prints the local URL to open. The board reads the same Markdown
files, so a change made by an agent appears there without an import step.

## Brand-new project, non-interactively

Outside a Git repository, `repoos init` enters a guided new-project flow. With
no terminal, pass `--new` and the answers as flags:

```bash
repoos init myproject --new \
  --description "A tiny social app for book clubs" \
  --areas web,api \
  --no-launch
```

Useful flags: `--description-file <path>` (`-` reads stdin), `--layout <ns>`,
`--commit` / `--no-commit`, `--launch` / `--no-launch`, `--preview-stub` /
`--no-preview-stub`, `--dir <path>`, `--force`, and `--json`.

Do **not** run `git init` first to avoid the prompts: inside a Git repository
init seeds the existing-codebase starter instead of the new-project one. Force a
starter on an existing repository with `repoos init --starter vision|codebase`.

Read more:
[Getting started → Initialize a repo](https://docs.repoos.org/getting-started#initialize-a-repo)
and the [`repoos init` CLI reference](https://docs.repoos.org/cli#repoos-init-name).

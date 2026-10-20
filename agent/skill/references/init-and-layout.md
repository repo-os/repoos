# Initialize and layout

## Existing repository

Run this from the repository root, only after the user agrees:

```bash
repoos init
```

It scaffolds four things and touches nothing else:

| Path | What it is |
| --- | --- |
| `repoos/work/` | One Markdown file per task. This is the board. |
| `repoos/docs/` | Project context an agent needs to work here. |
| `AGENTS.md` | Instructions every agent reads first; stays at the repository root. |
| `repoos.toml` | Configuration. Every field is optional; stays at the root. |

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

```bash
repoos serve
```

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

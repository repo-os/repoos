# Getting started

RepoOS runs inside a repo you already have. It doesn't host your code, and it
doesn't ask you to move your work anywhere — it adds a few directories and a
local server that reads them.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/repo-os/repoos/main/install.sh | bash
```

This installs a standalone build. You can also install it as a package
(`bun add -g repoos` / `npm i -g repoos`) or run from a source checkout.

RepoOS runs on **Bun** when it's available and falls back to **Node ≥ 20**
otherwise — see [Configuration](/configuration#runtime) if you want to pin one.

## Initialize a repo

From the root of any git repo:

```bash
repoos init
```

That scaffolds four things and touches nothing else:

| Path | What it is |
| --- | --- |
| `work/` | One markdown file per task. This is the board. |
| `docs/` | Context an agent needs to work on *this* project — architecture notes, decisions, history. |
| `AGENTS.md` | Instructions agents read first. The cross-tool standard; Claude Code, Codex, Cursor, Aider and Zed all read it. |
| `repoos.toml` | Configuration. Every field is optional. |

Run `repoos init` outside a git repo and it starts a guided flow for a brand
new project instead.

## Start the server

```bash
repoos serve
```

This starts the local control plane — a web UI and an API over the same files.
It picks a stable port derived from the repo's path, so two different repos
never collide; pin one with `servePort` if you'd rather. Stop it with
`repoos stop`.

The UI is where you'll spend most of your time: the board, agent chats, task
diffs, and the sign-off gate all live there.

## Create your first task

Either from the UI, or:

```bash
repoos new "Fix the login redirect loop"
```

Tasks start in `inbox`. Move one to `ready` when it's specified well enough to
hand over:

```bash
repoos mv 0001 ready
```

::: warning Let RepoOS write task files
Never hand-edit `work/*.md`. Status, activity history and metadata are written
through the CLI and API so the board stays consistent — use `repoos mv`,
`repoos update`, and `repoos note` rather than editing frontmatter directly.
:::

## Let an agent work it

Assign the task to an agent from the UI. RepoOS creates a dedicated git
worktree and branch for it, runs the coding agent there, and streams its output
live. Your main checkout is never touched.

When the agent is finished it moves the task to `review` and stops. It does
**not** merge its own work — that's your gate. Review the diff, then move the
task to `done`, which is what actually merges the branch to your trunk.

## The bar for "done"

```bash
repoos check
```

One command is the whole definition of done: build, typecheck, tests, and a
headless browser smoke test. Agents must get this green before handing a task
back to you, and it runs again before anything merges.

## Where to go next

- [CLI reference](/cli) — every command.
- [Configuration](/configuration) — `repoos.toml` and environment variables.
- [Concepts](/concepts) — how tasks, worktrees and the lifecycle fit together.

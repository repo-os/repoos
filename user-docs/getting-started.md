# Getting started

RepoOS runs inside a repo you already have. It doesn't host your code, and it
doesn't ask you to move your work anywhere — it adds a few directories and a
local server that reads them.

## Install

Choose one:

### curl — standalone build

```bash
curl -fsSL https://repoos.org/install.sh | bash
```

### Homebrew

```bash
brew install repo-os/tap/repoos
```

### npm

```bash
npm install -g @repo-os/repoos
```

### Bun

```bash
bun add -g @repo-os/repoos
```

### pnpm

```bash
pnpm add -g @repo-os/repoos
```

### mise

```bash
mise use --global npm:@repo-os/repoos
```

This uses mise's npm backend and saves RepoOS to your global mise
configuration. Enable mise shell activation so its `repoos` shim is on PATH.

The curl installer puts a self-contained release build in `~/.repoos` and a
`repoos` launcher in `~/.local/bin`. Update it with `repoos upgrade`.
Remove it later with `repoos uninstall`.
Package-manager installs update with `npm update -g @repo-os/repoos`,
`bun update -g @repo-os/repoos`, `pnpm update -g @repo-os/repoos`, or
`mise upgrade npm:@repo-os/repoos`, or `brew upgrade repo-os/tap/repoos`.

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

Either way the board is never empty: init seeds a `ready` task you can start on
immediately. In an existing repo it's "Read this codebase and propose docs/ + an
initial task backlog"; in the guided new-project flow it's "Flesh out the
product vision and initial architecture", and it carries the one-line project
description you gave at init. Both are self-contained enough to work without an
agent — read the task, do what it says, and it turns into `docs/` content and
concrete follow-up tasks. (`work/0001-set-up-repoos.md` is still scaffolded,
but it's marked `done`: it's a worked example of a task file, not work to do.)

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

One command is the whole definition of done: build, tests, and whatever else
your repo declares (see [The check gate](/check) for the full list and what's
opt-in). Agents must get this green before handing a task back to you, and it
runs again before anything merges.

## Where to go next

- [CLI reference](/cli) — every command.
- [Configuration](/configuration) — `repoos.toml` and environment variables.
- [Concepts](/concepts) — how tasks, worktrees and the lifecycle fit together.

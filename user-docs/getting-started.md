# Getting started

RepoOS runs inside a repo you already have. It doesn't host your code, and it
doesn't ask you to move your work anywhere — it adds a few directories and a
local server that reads them.

## Install

Choose one:

### curl — preferred

<div class="install-command">

```bash
curl -fsSL https://repoos.org/install | bash
```

</div>

::: tip Why curl
- **Easiest to update and uninstall** — `repoos upgrade` and `repoos uninstall`,
  no package manager involved.
- **Only method with release channels** — `repoos upgrade --channel beta|rc|canary`.
:::

### Homebrew

<div class="install-command">

```bash
brew install repo-os/tap/repoos
```

</div>

### npm

<div class="install-command">

```bash
npm install -g @repo-os/repoos
```

</div>

### Bun

<div class="install-command">

```bash
bun add -g @repo-os/repoos
```

</div>

### pnpm

<div class="install-command">

```bash
pnpm add -g @repo-os/repoos
```

</div>

### mise

<div class="install-command">

```bash
mise use --global npm:@repo-os/repoos
```

</div>

This uses mise's npm backend and saves RepoOS to your global mise
configuration. Enable mise shell activation so its `repoos` shim is on PATH.

The curl installer puts a self-contained release build in `~/.repoos` and a
`repoos` launcher in `~/.local/bin`. Remove it later with `repoos uninstall`.

## Updating RepoOS

Update with the same tool you used to install it. Do not run `repoos upgrade`
for a package-manager install: it leaves that install alone and prints the
matching command when it can identify the source.

| Installed with | Update command |
| --- | --- |
| curl | `repoos upgrade` |
| Homebrew | `brew update && brew upgrade repo-os/tap/repoos` |
| npm | `npm update -g @repo-os/repoos` |
| Bun | `bun update -g @repo-os/repoos` |
| pnpm | `pnpm update -g @repo-os/repoos` |
| mise | `mise upgrade npm:@repo-os/repoos` |

`repoos upgrade --channel beta`, `--channel canary`, and `--channel rc` are
available only for the curl install. Package-manager installs follow their
package manager's stable release channel.

RepoOS runs on **Bun** when it's available and falls back to **Node ≥ 20**
otherwise — see
[Configuration → Worktrees and runtime](/configuration#worktrees-and-runtime)
if you want to pin one.

## Initialize a repo

From the root of any git repo:

```bash
repoos init
```

That scaffolds four things and touches nothing else. Fresh installs keep RepoOS
metadata under `repoos/` by default; the interactive prompt can instead use the
repo root or another location.

| Path | What it is |
| --- | --- |
| `repoos/work/` | One markdown file per task. This is the board. |
| `repoos/docs/` | Context an agent needs to work on *this* project — architecture notes, decisions, history. |
| `AGENTS.md` | Instructions agents read first. The cross-tool standard; Claude Code, Codex, Cursor, Aider and Zed all read it. |
| `repoos.toml` | Configuration. Every field is optional. |

Run `repoos init` outside a git repo and it starts a guided flow for a brand
new project instead. In a terminal it asks a few questions; with no TTY (an
agent, a script) pass `--new` and answer them with flags:

```bash
repoos init myproject --new \
  --description "A tiny social app for book clubs" \
  --areas web,api --no-launch
```

See the [CLI reference](/cli#repoos-init-name) for every flag. Don't `git init`
first to avoid the prompts — that routes you to the existing-codebase starter
instead of the new-project one.

Either way the board is never empty: init seeds a starter task. Which starter
depends on what's in the repo — if there are no meaningful source files yet (a
fresh `git init`, a README-only repo, or only RepoOS's own scaffold) it seeds
"Flesh out the product vision and initial architecture"; once there is code to
read it seeds "Read this codebase and propose project docs + an initial task
backlog". The one-line summary after init says which was chosen and why. Force
one with `repoos init --starter vision|codebase`.

The starter is seeded as an **`inbox`** task, not `ready` — it's a suggestion
for you, not work to auto-run, and `created_by` is `repoos-init` so it can be
filtered (and archived) once a real backlog exists. Promote it when you want it
picked up:

```bash
repoos mv 0002 ready
```

Both starters are self-contained enough to work without an agent — read the
task, do what it says, and it turns into project-context docs and concrete
follow-up tasks. (`repoos/work/0001-set-up-repoos.md` is still scaffolded, but
it's marked `done`: it's a worked example of a task file, not work to do.)

## Starting a new project as an agent

An AI agent starting a brand-new RepoOS project hits a fork the interactive
docs don't cover: the new-project flow asks questions on a terminal, and an
agent's shell usually has no terminal. This section is the recipe that works
today, and the traps to avoid.

::: warning Use the new-project flow, not `git init` first
The guided flow is what seeds the **new-project** starter task. If you run
`git init` first and then `repoos init`, `repoos init` only sees "an existing
git repo" and seeds the **existing-codebase** starter instead
(`read-the-codebase`) — the wrong first task for a project with no code yet.
Starting RepoOS outside a git repo is what selects the right starter.
:::

### Non-interactive flags (the supported path)

Use a non-interactive `repoos init` that takes the project name, description,
and areas as flags, so an agent never needs a terminal at all:

```bash
repoos init my-project --new \
  --description "A tiny demo project" \
  --areas web,api \
  --no-launch
```

`--new` runs the guided flow with answers from flags and sensible defaults
(commit the scaffold; never launch the console unless `--launch`). See the
[CLI reference](/cli#repoos-init-name) for every flag — `--description-file -`
reads a multi-line description from stdin, `--layout` picks the repo-root or
`repoos/` layout, and `--json` prints a machine-readable summary.

Without `--new` and without a TTY, the command refuses and prints the exact
`--new` command to run, plus the `git init` warning below.

### Pseudo-terminal fallback (legacy workaround)

Before `--new` existed, the only way to drive the flow without a terminal was a
real pty. Prefer the flags above; this is kept for older releases. `pty.fork()`
hands the process a terminal, then you answer the prompts on its file descriptor:

`repoos init` in a non-git directory, with no TTY on stdin/stdout, refuses:

```
This directory isn't a git repo, so repoos init needs interactive prompts.
Run it in a terminal, or run `git init` first and then `repoos init` again.
```

The second line is the trap above, not the fix. The fix is to give the process
a real terminal. `pty.fork()` hands it one, then you answer the prompts on its
file descriptor. ~15 lines, Python 3, no dependencies:

```python
import pty, os, sys, time

script = "\n".join([
    "my-project",          # project name (Enter = current directory)
    "",                    # layout: Enter = repoos/ subdir
    "y",                   # git init + scaffold? [Y/n]
    "A tiny demo project", # one-line project description
    "",                    # task areas to seed (Enter = skip)
    "",                    # preview-target stubs? [Y/n]
    "",                    # starter check plan? (if offered)
    "n",                   # commit the scaffold? [Y/n]
    "n",                   # launch the web console? [Y/n]
])

pid, fd = pty.fork()
if pid == 0:
    os.execvp("repoos", ["repoos", "init"])   # the child gets the TTY
else:
    for answer in script.split("\n"):
        while True:
            data = os.read(fd, 1024)
            if not data:
                break
            sys.stdout.buffer.write(data); sys.stdout.buffer.flush()
            if data.rstrip().endswith((b":", b"]")):  # a prompt is waiting
                os.write(fd, (answer + "\n").encode())
                break
    os.waitpid(pid, 0)
```

Run it from the directory that should hold the project. It produces the same
files an interactive run would, including the correct
`flesh-out-the-vision` starter. The exact prompts shift between releases, so
treat the answers list as a starting point and adjust from the output.

### Right after init

1. **Read `AGENTS.md`.** It's the operating loop for this repo — where the
   board is, how to create tasks, how to hand off. Everything below is in more
   detail there.
2. **The starter task is a suggestion, not a queue item.** Init leaves
   `flesh-out-the-vision` in `ready` as a prompt for the project's first work.
   It is not dispatched to an agent until a human starts it; don't auto-run it.
3. **Never hand-edit `work/*.md`.** Create and change tasks with `repoos new`,
   `repoos mv`, `repoos update`, `repoos note`, or the HTTP API — never by
   editing frontmatter or files directly.
4. **Start the server in a real terminal tab, or as a service.** An agent shell
   reaps background processes when its command returns, so a `repoos serve`
   started with `&` from a tool call dies with it. Either run it in a terminal
   you keep open, or register it as a managed background service:

   ```bash
   repoos service install    # register a managed background service
   repoos service start      # it survives the shell that started it
   repoos service status
   ```

   Never run `repoos serve` from inside a short-lived agent command and expect
   it to stay up.

## Start the server

```bash
repoos serve
```

This starts the local control plane — a web UI and an API over the same files.
It picks a stable port derived from the repo's path, so two different repos
never collide; pin one with `servePort` if you'd rather. Stop it with
`repoos stop`.

The UI is where you'll spend most of your time: the board, agent chats, task
diffs, and the review controls all live there.

## Create your first task

Either from the UI, or:

```bash
repoos new "Fix the login redirect loop"
```

Tasks start in `inbox`, including the starter `repoos init` seeds. Move one to
`ready` when it's specified well enough to hand over:

```bash
repoos mv 0002 ready
```

(`0001` is the `done` scaffolding example; your seeded starter is `0002`.)

::: warning Let RepoOS write task files
Never hand-edit task files. Status, activity history and metadata are written
through the CLI and API so the board stays consistent — use `repoos mv`,
`repoos update`, and `repoos note` rather than editing frontmatter directly.
:::

## Let an agent work it

Assign the task to an agent from the UI. RepoOS creates a dedicated git
worktree and branch for it, runs the coding agent there, and streams its output
live. Your primary checkout is never touched.

When the agent is finished it asks for the task to move to `review` and stops.
RepoOS re-runs the check, commits the branch and does the moving — the task
stays `active` with a *running checks* badge until that finishes. The agent does
**not** merge its own work. Review the diff, then move the
task to `done`, which is what actually merges the branch to your trunk.

## The bar for "done"

```bash
repoos check
```

One command is the whole definition of done: build, tests, and whatever else
your repo declares (see [Checks before merge](/check) for the full list and what's
opt-in). Agents must get this green before handing a task back to you, and it
runs again before anything merges.

## Where to go next

- [CLI reference](/cli) — every command.
- [Configuration](/configuration) — `repoos.toml` and environment variables.
- [Concepts](/concepts) — how tasks, worktrees and the lifecycle fit together.
- [Running a project with AI agents](/running-with-agents) — a practical loop for driving a board with agents.

Starting this repo with an AI agent? See
[Starting a new project as an agent](#starting-a-new-project-as-an-agent) above
for the recipe and the traps.

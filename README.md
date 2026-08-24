# RepoOS

**The repo is the operating system.**

RepoOS is a lightweight, repo-native way to track work that lives as markdown
files inside your monorepo. Tasks, specs, bugs, and feature requests are plain
`.md` files with YAML frontmatter — versioned in git, readable by humans, and
designed to be consumed directly by AI coding agents.

It is **not** a Jira/Linear replacement bolted onto your repo. It is the
connective tissue for an AI-native workflow: humans define and review work,
agents read the same files as full context and execute against the repo.
RepoOS directly spawns and manages coding agents in isolated worktrees,
streams their output, and keeps humans as the sign-off gate.

```
the repo  ──▶  source of truth (markdown + git)
   │
   ├─ work/*.md      tasks, specs, bugs  (status lives in frontmatter)
   ├─ docs/          architecture, ADRs, AGENTS.md
   └─ .repoos/       derived index cache (gitignored, disposable)
```

## Why

Traditional trackers fragment context away from where agents actually work. The
friction that historically made "markdown as a task system" lose to Jira was
*humans* editing YAML — and that's exactly the friction an LLM removes. RepoOS
leans into that: the task file is the spec the agent reads, the status it
updates, and the artifact git versions.

RepoOS doesn't just host tasks that agents read — it spawns and manages the
agents themselves. You configure a coding agent on the Agents page, click Start
on a task, and RepoOS launches the agent in a dedicated git worktree, streams
its output live, and lets you resume the conversation at any point. When the
agent finishes, the task moves to review for human sign-off. Agents are
first-class participants, but humans always hold the gate.

## Install

Install a standalone `repoos` command straight from GitHub Releases:

```bash
curl -fsSL https://raw.githubusercontent.com/repo-os/repoos/main/install.sh | bash
```

Requires Node.js >= 20.6.0. Installs to `~/.repoos` and links `repoos` into `~/.local/bin`.

Then in any repo:

```bash
repoos init        # scaffold work/, docs/, repoos.toml, AGENTS.md (idempotent)
```

Zero config required. `repoos init` walks up to find your repo root, creates the
folders if missing, adds a sample task, and gitignores the derived cache.

## Core principles

1. **Files are truth.** Every task is a markdown file. Delete the cache, lose
   nothing.
2. **Status is a field, not a folder.** `repoos mv 0012 active` edits the
   `status:` frontmatter — the file never moves. No git churn, no merge
   conflicts from two agents touching a queue.
3. **The index is derived.** `.repoos/index.json` is a disposable cache,
   rebuilt from files on demand. It exists for fast reads (and the upcoming
   local server), never as a source of truth.
4. **Zero runtime dependencies.** Installs instantly; nothing to break.
5. **Degrades gracefully.** No git? Still works. No config? Sensible defaults.

## Commands

```bash
repoos init                    Scaffold this repo for RepoOS
repoos list [status]           Show the board, or one column
repoos show <id>               Show a task's full spec
repoos mv <id> <status>        Move a task (inbox|ready|active|review|done)
repoos new "<title>" [flags]   Create a task
repoos index [--json]          Rebuild the derived index (--json for agents/tools)
repoos serve [--port N]        Start the local server: live API + SSE event stream
repoos check                   Definition-of-done gate (build, typecheck, tests, UI smoke)
repoos tunnel [subcommand]     Cloudflare Tunnel + Zero Trust publishing
```

**`repoos new` flags:** `--ai` (assign to AI), `--type`, `--area`, `--priority`.

```bash
repoos new "Add company dashboard" --ai --type feature --area web --priority p1
repoos mv 0012 active
repoos list ready
repoos index --json        # machine-readable, pipe to agents
```

## Task file format

```markdown
---
id: "0012"
title: Add company dashboard
type: feature
status: ready
priority: p1
area: web
assigned_to: ai
created_by: human
branch: feat/0012-company-dashboard
---

## Problem
Agency owners have no single view of placements, fill rate, and revenue.

## Desired UX
A glanceable dashboard: KPI cards, a revenue chart, upcoming shifts.

## Acceptance criteria
- [ ] KPI summary cards
- [ ] Revenue chart with range selector

## Notes for AI
Use the StatCard component from @ui. Mock data until backend #0020 lands.
```

Unknown frontmatter keys are **preserved** on write — RepoOS never clobbers
fields it doesn't recognize.

## Use as a library

The CLI is a thin shell over a programmatic API. The same API powers the
local server and can be called from your own scripts or agents.

```ts
import { createRepoOS } from "repoos";

const repoos = createRepoOS();              // resolves repo root + config

repoos.getTasks("active");                  // Task[]
repoos.getTask("0012");                     // Task | null
repoos.counts();                            // { inbox, ready, active, review, done }
repoos.updateStatus("0012", "review");      // edits frontmatter, returns Task
repoos.createTask({ title: "New thing", assignedTo: "ai", priority: "p1" });
repoos.reindex();                           // rebuild + cache the index
```

## Configuration

Optional `repoos.toml` at the repo root. These are the defaults:

```toml
workDir = "work"
docsDir = "docs"
defaultStatus = "inbox"
defaultAssignee = "unassigned"
cacheDir = ".repoos"
```

## The local server

`repoos serve` starts a long-lived process that holds the index in memory, watches
your task files, and serves a JSON API plus a live event stream. It adds no new
business logic — it's a transport layer over the same core the CLI uses.

```bash
repoos serve                 # http://127.0.0.1:7171 (or your Tailscale IP, if detected)
repoos serve --port 8080     # custom port
repoos serve --host 0.0.0.0  # listen on all interfaces
repoos serve --quiet         # no terminal activity log
```

If Tailscale is running on the machine, `repoos serve` binds to `0.0.0.0` (all
interfaces) by default instead of localhost-only, so it's reachable both from
your other Tailscale devices and from localhost-only tools on the same machine
(e.g. a Cloudflare Tunnel's local origin). Pass `--host 127.0.0.1` explicitly
to restrict it to localhost only.

### Endpoints

```
GET    /api/health             { ok, root, taskCount, workDir }
GET    /api/tasks              Task[]   (?status=active to filter)
GET    /api/tasks/:id          Task | 404
GET    /api/counts             { inbox, ready, active, review, done }
GET    /api/index              full RepoIndex snapshot
GET    /api/docs               [{ path, title }]  context docs listing
GET    /api/skills             [{ name, path }]  installed skills
GET    /api/config             current repoos.toml config
GET    /api/agents/detect      installed coding agents found on PATH
GET    /api/agents/running     currently running agent sessions
GET    /api/tasks/:id/output   agent session transcript for a task
POST   /api/tasks              create  { title, type?, area?, priority?, assignedTo? }
POST   /api/tasks/freeform     create  { prompt }  AI-drafted task from a description
PATCH  /api/tasks/:id          patch   { status?, title?, priority?, ... }
PATCH  /api/config             edit repoos.toml fields
DELETE /api/tasks/:id          delete a task
POST   /api/tasks/:id/start    launch an agent on this task
POST   /api/tasks/:id/pause    stop a running agent (graceful)
POST   /api/tasks/:id/message  send a follow-up to an agent session
POST   /api/tasks/:id/done     review-to-done: merge branch, close worktree
GET    /api/events             SSE stream of repo events
```

### The event stream

`GET /api/events` is a Server-Sent Events stream. It emits an event whenever the
repo changes — whether the change came through the API or from a file edited
directly on disk (e.g. by an AI agent). This is the heartbeat the UI subscribes
to; no polling.

```
event: task.updated
data: {"type":"task.updated","task":{...},"prev":{"status":"ready"},"at":"..."}
```

Event types: `hello`, `index.rebuilt`, `task.created`, `task.updated`,
`task.deleted`, `agent.running`, `agent.exited`, `agent.output`,
`task.corrected`. Because an agent editing a markdown file produces the same
event as an API call, agents are first-class participants without needing to
know RepoOS exists — they just edit files.

### Concurrent writes

Status lives in per-task files, so two writers touching *different* tasks never
conflict. For the same task, the server re-reads the file immediately before
writing and merges the change onto current on-disk state, so a status update
won't clobber a body edit an agent made a moment earlier.

## The web UI

`repoos serve` also serves a web UI at the root URL — open `http://127.0.0.1:7171`
in a browser. It's a live control plane: a dashboard, the work board, an Agents
page for configuring and running coding agents, a context-docs viewer with
skills, and settings. All reading from the API and updating in real time via the
SSE stream. Edit a task file in your editor (or let an agent edit it) and the
board updates instantly — no reload.

The UI ships prebuilt and vendored (Vue is bundled, not loaded from a CDN), so
it works fully offline — important for a tool running on a local box.

## Agent orchestration

RepoOS can spawn and manage coding agents (opencode, Claude Code, Qwen, Codex)
to execute tasks. Agents run in isolated git worktrees per task so parallel work
never collides. Output streams over SSE in real time, and the per-task chat tab
lets you resume a session mid-flight. When the agent finishes, the task moves to
review — human sign-off is always the gate.

Configure agents on the Agents page: choose the CLI, pick a model (sourced live
from `opencode models`), add custom instructions, and set up PM and reviewer
roles alongside the engineer agent. Freeform task creation sends a description
through the PM agent for structured drafting. All agent capability is local —
no API tokens leave your machine unless you configure them.

## Roadmap

- **Stage 1 — parser + index + CLI** ✅
- **Stage 2 — local server** ✅ — live index, file watcher, JSON API, SSE.
- **Stage 3 — web UI** ✅ — Vite + Vue 3 SFC, served from the local server,
  responsive (desktop + mobile), live-updating via SSE.
- **Stage 4** — read-only deploy/infra panel (Railway, Cloudflare Pages).
- **Stage 5 — agent orchestration** ✅ — spawn coding agents (opencode, Claude
  Code, Qwen, Codex) in git worktrees per task, stream their output over SSE,
  resume sessions via chat, and move completed work into review. Actively
  being hardened and extended (agent-visible worktree previews, context packs,
  and sandbox handoff).

For live status and what's in progress, run `repoos list`. The task files in
`work/` are the authoritative record of current work.

## License

[FSL-1.1-MIT](LICENSE.md) — free to use, self-host, and modify. The only
restriction is offering it as a competing commercial product/service. Each
version converts to plain MIT two years after release.

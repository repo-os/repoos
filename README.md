# RepoOS

**The repo is the operating system.**

RepoOS is a lightweight, repo-native way to track work that lives as markdown
files inside your monorepo. Tasks, specs, bugs, and feature requests are plain
`.md` files with YAML frontmatter — versioned in git, readable by humans, and
designed to be consumed directly by AI coding agents.

It is **not** a Jira/Linear replacement bolted onto your repo. It is the
connective tissue for an AI-native workflow: humans define and review work,
agents read the same files as full context and execute against the repo.

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

## Install

```bash
# one-off, no install
bunx repoos init
npx  repoos init

# or add to a repo
bun add -d repoos
npm i -D repoos
```

Then in any repo:

```bash
ros init        # scaffold work/, docs/, repoos.toml, AGENTS.md (idempotent)
```

Zero config required. `ros init` walks up to find your repo root, creates the
folders if missing, adds a sample task, and gitignores the derived cache.

## Core principles

1. **Files are truth.** Every task is a markdown file. Delete the cache, lose
   nothing.
2. **Status is a field, not a folder.** `ros mv 0012 active` edits the
   `status:` frontmatter — the file never moves. No git churn, no merge
   conflicts from two agents touching a queue.
3. **The index is derived.** `.repoos/index.json` is a disposable cache,
   rebuilt from files on demand. It exists for fast reads (and the upcoming
   local server), never as a source of truth.
4. **Zero runtime dependencies.** Installs instantly; nothing to break.
5. **Degrades gracefully.** No git? Still works. No config? Sensible defaults.

## Commands

```bash
ros init                    Scaffold this repo for RepoOS
ros list [status]           Show the board, or one column
ros show <id>               Show a task's full spec
ros mv <id> <status>        Move a task (inbox|ready|active|review|done)
ros new "<title>" [flags]   Create a task
ros index [--json]          Rebuild the derived index (--json for agents/tools)
ros serve [--port N]        Start the local server: live API + SSE event stream
```

**`ros new` flags:** `--ai` (assign to AI), `--type`, `--area`, `--priority`.

```bash
ros new "Add company dashboard" --ai --type feature --area web --priority p1
ros mv 0012 active
ros list ready
ros index --json        # machine-readable, pipe to agents
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
(upcoming) local server and can be called from your own scripts or agents.

```ts
import { createRepoOS } from "repoos";

const ros = createRepoOS();              // resolves repo root + config

ros.getTasks("active");                  // Task[]
ros.getTask("0012");                     // Task | null
ros.counts();                            // { inbox, ready, active, review, done }
ros.updateStatus("0012", "review");      // edits frontmatter, returns Task
ros.createTask({ title: "New thing", assignedTo: "ai", priority: "p1" });
ros.reindex();                           // rebuild + cache the index
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

`ros serve` starts a long-lived process that holds the index in memory, watches
your task files, and serves a JSON API plus a live event stream. It adds no new
business logic — it's a transport layer over the same core the CLI uses.

```bash
ros serve                 # http://127.0.0.1:7171
ros serve --port 8080     # custom port
ros serve --quiet         # no terminal activity log
```

### Endpoints

```
GET   /api/health             { ok, root, taskCount, workDir }
GET   /api/tasks              Task[]   (?status=active to filter)
GET   /api/tasks/:id          Task | 404
GET   /api/counts             { inbox, ready, active, review, done }
GET   /api/index             full RepoIndex snapshot
GET   /api/docs              [{ path, title }]  context docs listing
POST  /api/tasks             create  { title, type?, area?, priority?, assignedTo? }
PATCH /api/tasks/:id         patch   { status?, title?, priority?, ... }
GET   /api/events            SSE stream of repo events
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
`task.deleted`. Because an agent editing a markdown file produces the same
event as an API call, agents are first-class participants without needing to
know RepoOS exists — they just edit files.

### Concurrent writes

Status lives in per-task files, so two writers touching *different* tasks never
conflict. For the same task, the server re-reads the file immediately before
writing and merges the change onto current on-disk state, so a status update
won't clobber a body edit an agent made a moment earlier.

## The web UI

`ros serve` also serves a web UI at the root URL — open `http://127.0.0.1:7171`
in a browser. It's a live control plane: a dashboard, the work board, and a
context-docs viewer, all reading from the API and updating in real time via the
SSE stream. Edit a task file in your editor (or let an agent edit it) and the
board updates instantly — no reload.

The UI ships prebuilt and vendored (Vue is bundled, not loaded from a CDN), so
it works fully offline — important for a tool running on a local box.

## Roadmap

- **Stage 1 — parser + index + CLI** ✅
- **Stage 2 — local server** ✅ — live index, file watcher, JSON API, SSE.
- **Stage 3 — web UI** ✅ *(this release)* — served from the local server,
  responsive (desktop + mobile), live-updating via SSE.
- **Stage 4** — read-only deploy/infra panel (Railway, Cloudflare Pages).
- **Stage 5** — agent orchestration: spawn agents in git worktrees per task,
  stream their logs, write results back.
- **Hardening** — Vitest suite over the frontmatter round-trip, live-index
  diffing, and safe-write merge (deferred until the system is fully wired).

## License

MIT

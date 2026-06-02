# Concepts

The vocabulary the rest of this repo assumes. Terms are defined in dependency
order — each builds on the ones above it. If a word in the docs, the code, or a
task file is unclear, it's defined here.

## The three states of data

Everything in RepoOS is one of three things. Conflating them is the most common
source of confusion.

- **Truth** — the markdown files under `work/` plus git history. The *only*
  authoritative state. Everything else can be deleted and rebuilt from this.
- **Derived** — anything computed from truth: the index, the cached
  `.repoos/index.json`, the in-memory state the server holds. Disposable by
  definition; if it disagrees with the files, the files win.
- **Ephemeral** — runtime-only state that never touches disk: live SSE
  connections, streamed logs. Gone when the process stops.

When in doubt about where something belongs, ask which of these three it is. New
authoritative state goes in files; everything else is derived or ephemeral.

## Task

A unit of work — a feature, bug, spec, or chore — stored as a single markdown
file under `work/`. The file is the task; there is no database row behind it.
A task has **frontmatter** (structured fields) and a **body** (the markdown
spec). The file *is* truth (see above).

## Frontmatter

The YAML block at the top of a task file, between `---` lines. Holds the
structured fields: `id`, `title`, `type`, `status`, `priority`, `area`,
`assigned_to`, `branch`, and others. RepoOS parses this with its own
dependency-free parser, which **preserves any keys it doesn't recognize** on
write — so adding your own fields is safe; they round-trip untouched.

## Status and the lifecycle

A task's `status` frontmatter field, one of five lifecycle states, in order:

`inbox` → `ready` → `active` → `review` → `done`

Status is a **field, not a folder** — changing it edits the file in place; the
file never moves. (Why: ADR-0002.) The board columns in the CLI and UI are
simply tasks grouped by this field.

- **inbox** — captured, not yet triaged or ready to start.
- **ready** — specified and ready for someone (often an agent) to pick up.
- **active** — in progress.
- **review** — implemented, awaiting human sign-off.
- **done** — complete.

## Assignee

Who owns a task, via `assigned_to`. RepoOS treats **`ai` as a first-class
assignee** alongside humans — a task assigned to `ai` is meant for an agent to
execute. This is central to the model, not a tag: humans set direction, agents
do work.

## Index

The derived, queryable view built by walking `work/` and parsing every task.
Sorted deterministically (status order, then priority, then id) and cached at
`.repoos/index.json` for fast reads. The cache is *derived* — gitignored,
rebuilt from files anytime. Never edit it by hand; it has no authority.

## The facade

`createRepoOS()` in `src/core/repoos.ts` — the single API through which all
reads and mutations of task files happen. The CLI and the server both call it.
**It is the only place that writes task files.** No business logic lives outside
it; the layers above (CLI, server) are transport only.

## The layers

How the code is organized, low to high:

- **core** (`src/core`) — the engine: parse, index, mutate. Pure logic, the
  facade lives here.
- **cli / commands** (`src/cli`, `src/commands`) — one-shot `ros` commands.
- **server** (`src/server`) — the long-lived process adding *liveness*: an
  in-memory index, a file watcher, the JSON API, and the SSE stream.
- **ui** (`src/ui`) — the web control plane, served by the server, updating live.

(Full map: `docs/architecture.md`.)

## SSE stream

Server-Sent Events — the one-way live channel at `/api/events` the server
pushes change events down (`task.created`, `task.updated`, `task.deleted`). The
UI subscribes to it and updates without polling. The key property: an edit made
through the API and an edit made by changing a file directly produce the *same*
event — so an agent editing a file is indistinguishable from a UI action.

## Derived index cache

See **Index**. Named here because you'll see `.repoos/index.json` referenced —
it's that cache, derived and disposable, not a data store.

## Self-hosting (dogfooding)

RepoOS manages its own development: this repo's roadmap lives as `work/*.md`,
managed by the tool itself. This creates hazards that exist in no other repo —
chiefly that editing `src/` doesn't affect the running `ros` until you rebuild.
If you're working in *this* repo, read the self-hosting section of `/AGENTS.md`
before doing anything. (Rationale: ADR-0003.)

## `ros init` vs the template

`ros init` scaffolds a repo for RepoOS (creates `work/`, `docs/`, `AGENTS.md`,
`repoos.toml`). The `AGENTS.md` it writes comes from a **template** — a string
in `src/commands/init.ts`. That template is *not* this repo's own `AGENTS.md`;
editing it changes what every future `ros init` produces. Don't confuse the two.

## Quick reference

- **Truth** = files + git. **Derived** = index/cache. **Ephemeral** = live
  connections.
- A **task** is a markdown file. **Status** is a field, not a folder.
- **`ai`** is a first-class assignee.
- The **facade** is the only thing that writes tasks.
- The **SSE stream** makes file edits and API edits look identical to the UI.

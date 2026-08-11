# Architecture

The current-state map of how RepoOS fits together. Unlike the ADRs in
`docs/adr/` (frozen decision records) and the vision (which rarely changes),
this document is living — it should track the system as it actually is today.
If you change the structure and this doc no longer matches, update it in the
same change.

## Shape

RepoOS is a zero-runtime-dependency TypeScript package that runs under Bun (and
under Node >= 20 once built). It is a library with a CLI and a local server on
top, all operating over one idea: the repo's `work/*.md` files are the source
of truth, and everything else is derived.

    files on disk (work/*.md + git)      <- source of truth
            |
       src/core      the engine: parse, index, mutate
            |
       +-- src/cli + src/commands        one-shot commands (repoos ...)
       |
       +-- src/server                    long-lived: API + SSE + watcher
                  |
             src/ui-app                   the Vite + Vue 3 web UI, served by the server

## Layers

### src/core — the engine

Pure logic, no transport. Everything else calls into this.

- `types.ts` — the shared data model (Task, Status, RepoIndex, config). The
  contract every layer agrees on.
- `frontmatter.ts` — dependency-free YAML frontmatter parse/serialize.
  Preserves unknown keys on round-trip (a core promise). The highest-risk
  surface.
- `config.ts` — resolves the repo root and merges `repoos.toml` over defaults.
- `git.ts` — best-effort git facts (branch existence, last commit). Degrades
  silently if git is absent.
- `task.ts` — turns a file's content+path into a normalized Task, and back.
- `indexer.ts` — walks `work/`, builds the sorted RepoIndex, manages the
  derived `.repoos/index.json` cache.
- `repoos.ts` — the createRepoOS() facade: getTasks, getTask, counts,
  updateStatus, updateTask, createTask, reindex. The CLI and server both go
  through this; no business logic lives outside it.

### src/cli + src/commands — one-shot commands

Thin shells over the facade. `cli/index.ts` routes argv; each `commands/*.ts`
calls a facade method and prints. `cli/colors.ts` is the terminal styling.
Commands: init, list, show, mv, new, index, serve.

### src/server — the long-lived process

Adds liveness over the one-shot core. No new business logic.

- `live-index.ts` — holds the index in memory, applies incremental per-file
  updates, emits typed events (task.created / task.updated / task.deleted).
- `watcher.ts` — native fs.watch over `work/`, debounced; feeds live-index.
- `write.ts` — safe single-task mutation that re-reads immediately before
  writing, so concurrent edits to the same file don't clobber.
- `server.ts` — dependency-free HTTP server (Node/Bun http): the JSON API, the
  SSE stream at `/api/events`, static serving of the UI at `/`, and read-only
  serving of markdown docs for the Context view.

### src/ui-app — the web UI

The Vite + Vue 3 SFC application reads from the API on load, subscribes to the
SSE stream, and renders the dashboard / work board / context viewer.
Responsive: sidebar on desktop, bottom tabs on mobile. Vite builds it into
`dist/ui/`.

## Data flow

- Read: UI/CLI -> facade (or server's live-index) -> parse `work/*.md` ->
  Task[]. The index cache accelerates this but is never authoritative.
- Write: UI -> PATCH /api/tasks/:id -> safe-write re-reads the file, merges the
  change, writes. Or an agent/human edits the file directly. Either way ->
- Watch: the file change -> watcher -> live-index re-parses that one file ->
  emits an event -> SSE pushes it -> every connected UI updates. No polling.

This convergence — API edits and raw file edits producing the same event — is
the architectural payoff: agents participate by editing files, needing to know
nothing about RepoOS itself.

## The three runtime states (don't conflate them)

- Truth — the markdown files + git. Survives everything.
- Derived — `.repoos/index.json`, the in-memory index. Disposable, rebuilt from
  truth at any time.
- Ephemeral — SSE connections, live logs. Never touches disk.

## Invariants

- The facade (core/repoos.ts) is the only place that mutates task files.
- Status is a frontmatter field; files never move (see ADR-0002).
- Zero runtime dependencies. Dev deps only.
- The server adds transport, not logic — anything reusable belongs in core.

## Build and layout notes

`bun run build` runs tsc, copies server assets, and builds `src/ui-app/` with
Vite into `dist/ui/`. The published package ships prebuilt `dist/`, so users
never compile. NodeNext modules mean `.ts` source uses `.js` import specifiers
— intentional, not a bug.

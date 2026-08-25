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
       +-- src/server                    long-lived: API + SSE + watcher + agent runner
            |         \
            |     src/server/agents.ts    spawn agents in git worktrees, stream output
            |
       src/ui-app                        the Vite + Vue 3 web UI, served by the server

## Layers

### src/core — the engine

Pure logic, no transport. Everything else calls into this.

- `types.ts` — the shared data model (Task, Status, Agent, AgentOutputEntry,
  RepoIndex, config). The contract every layer agrees on.
- `frontmatter.ts` — dependency-free YAML frontmatter parse/serialize.
  Preserves unknown keys on round-trip (a core promise). The highest-risk
  surface.
- `config.ts` — resolves the repo root and merges `repoos.toml` over defaults.
- `git.ts` — best-effort git facts (branch existence, last commit, worktree
  creation/removal, merge). Degrades silently if git is absent.
- `task.ts` — turns a file's content+path into a normalized Task, and back.
- `indexer.ts` — walks `work/`, builds the sorted RepoIndex, manages the
  derived `.repoos/index.json` cache. `buildIndex` is synchronous (the CLI's
  one-shot commands use it); `buildIndexAsync` runs the same per-task git
  enrichment concurrently instead of one spawn at a time — the server uses it
  at boot (via `live-index.ts`'s `refreshAllAsync`) so `listen()` doesn't wait
  behind hundreds of serial git spawns (#0271: this was 20-30s at 260 tasks).
- `repoos.ts` — the createRepoOS() facade: getTasks, getTask, counts,
  updateStatus, updateTask, createTask, reindex. The CLI and server both go
  through this; no business logic lives outside it.
- `detect.ts` — probes PATH for installed coding agents (opencode, Claude Code,
  Qwen, Codex, GitHub Copilot CLI) and reports version + availability.
- `models.ts` — per-CLI model list adapters (e.g. sources `opencode models`
  live for the Agents page dropdown). Copilot model discovery is not stable, so
  it offers its default and supports per-model compatibility probes.
- `build.ts` — build staleness check (hash of `src/` vs `dist/.build-info.json`,
  which holds `{ hash, version }` and is deterministic across rebuilds) plus
  `readBuildStamp()`, the single reader for the build timestamp in the
  gitignored `dist/.build-stamp.json`.

### src/cli + src/commands — one-shot commands

Thin shells over the facade. `cli/index.ts` routes argv; each `commands/*.ts`
calls a facade method and prints. `cli/colors.ts` is the terminal styling.
Commands: init, list, show, mv, new, index, serve.

### src/server — the long-lived process

Adds liveness over the one-shot core. No new business logic.

- `live-index.ts` — holds the index in memory, applies incremental per-file
  updates, emits typed events (task.created / task.updated / task.deleted).
  `refreshAllAsync` (boot only) lets `server.ts` bind the port before the
  full rebuild finishes; `refreshAll` (synchronous) is for callers that need
  the index populated when the call returns.
- `watcher.ts` — native fs.watch over `work/`, debounced; feeds live-index.
- `write.ts` — safe single-task mutation that re-reads immediately before
  writing, so concurrent edits to the same file don't clobber.
- `server.ts` — dependency-free HTTP server (Node/Bun http): the JSON API, the
  SSE stream at `/api/events`, static serving of the UI at `/`, and read-only
  serving of markdown docs for the Context view.
- `agents.ts` — the AgentRunner: spawns coding agents in task worktrees, streams
  output as structured events over SSE, manages session transcripts for resume,
  self-heals board state when the agent exits, and hosts the persistent
  repository-level RepoOS Guide conversation using the same session model. Its
  Copilot CLI driver uses JSONL output and explicit, narrow write/shell
  permissions; it never uses the CLI's unrestricted permission switches.
- `freeform.ts` — parses freeform task description output from the PM agent
  into structured task frontmatter + body.
- `done.ts` — review-to-done close-out: merges the task branch into main,
  removes the worktree, and cleans up.
- `review.ts` — the review agent: when a task lands in `review` (by any route),
  it runs the enabled `reviewer` agent read-only over the task's worktree and
  writes a short report to `<cacheDir>/reviews/<id>.md` for the human signing
  off. Advisory: it never edits the repo and never moves a task to `done` —
  a task that comes back `done` is put straight back into `review`.
- `preview.ts` — starts/stops read-only worktree preview servers on dedicated
  ports. On-demand only (`POST /api/tasks/:id/preview`), capped at ONE running
  at a time — starting a new one evicts the last (FIFO). Used to auto-launch
  on a task entering `review` and allow 4 concurrent (#0198); removed once
  startup got fast enough that the wait it existed to avoid stopped mattering
  (#0271) — auto-launching several at once (at boot, or as tasks land in
  review in a burst) was itself a source of CPU contention.
- `reload.ts` — auto-reload: watches the dist hash and swaps in a zero-downtime
  replacement process. A failed handoff backs off (10s, doubling, capped at
  5min) before the next AUTOMATIC retry so a run of failures can't retry every
  ~5s forever — see the #0271 incident this guards against, where that
  thrashing (spawning a full server boot every ~5s, 29 times) took the control
  plane down. `POST /api/server/restart` (a human explicitly asking) bypasses
  the backoff.

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
- Agent: UI/API -> POST /api/tasks/:id/start -> AgentRunner spawns the coding
  agent in the task's git worktree -> stdout/stderr line-buffered into a session
  transcript -> structured JSON events parsed and emitted as SSE `agent.output`
  events -> the UI renders the agent chat tab in real time. Follow-ups via
  POST /api/tasks/:id/message resume the same session.
- Guide chat: the app-root launcher -> POST /api/chat/message -> the built-in
  RepoOS Guide agent runs read-only at the repository root with a live task and
  context-document summary. Its streamed transcript uses the same AgentRunner
  and SSE events, so it survives client-side route changes without becoming a task.
- Review: a task reaching `review` -> live-index event -> the review agent runs
  read-only in that task's worktree -> its report is stored under `.repoos/` and
  served by GET /api/tasks/:id/review -> the drawer shows it beside "Move to
  done", which stays the human's call.
- Release: after the review-to-done flow merges a task and its post-merge checks
  pass, it appends a `released` entry to that task's Activity log. The Control
  page derives its persistent feature-release timeline from those entries;
  ordinary status edits and failed close-outs never create releases.

This convergence — API edits, raw file edits, and agent output all producing
the same event stream — is the architectural payoff: agents participate by
editing files, needing to know nothing about RepoOS itself.

## GitHub Copilot CLI driver

RepoOS runs GitHub Copilot CLI (`npm i -g @github/copilot`) in a task worktree
with `-p`, `--output-format json`, and `--no-ask-user`. Its JSONL transcript
captures assistant text, tool activity, errors, and the final `sessionId`;
follow-up task-chat prompts use that id with `--resume=<session-id>`. It does
not use `--continue`, which could resume a different task's most recent
session.

The driver intentionally never passes `--allow-all`, `--allow-all-tools`, or
`--yolo`. It grants file writes and only the engineering command families
needed for a RepoOS task (`bun`, `node`, `npm`, `npx`, `git`, `curl`, `ls`, and
`cat`), while the CLI's default worktree path boundary remains in force.
Copilot's live model listing is not yet a stable CLI interface, so the Agents
page offers `default`; any configured model id can still be checked through the
existing compatibility probe.

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

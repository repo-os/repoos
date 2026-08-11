# Roadmap

This is the **staged arc** — the shape of where RepoOS is going, at a higher
altitude than individual tasks. For live, current detail — what's in progress,
what's ready, what's blocked — run `repoos list` or open the board. The task files
in `work/` are the source of truth for *what's happening now*; this document is
the source of truth for *the overall direction*. When they disagree, `work/`
wins on detail and this doc wins on intent.

## Where we are

The foundation is built and self-hosted: RepoOS now manages its own development
via `work/*.md` (see `docs/adr/0003-self-hosting.md`).

- **Stage 1 — core: parser, index, CLI.** Done. Repo-native tasks, the derived
  index, and the `repoos` commands (`init`, `list`, `show`, `mv`, `new`, `index`,
  `check`, `tunnel`).
- **Stage 2 — local server.** Done. In-memory live index, file watcher, JSON
  API, and an SSE event stream. Human edits, CLI edits, and agent file edits all
  converge into one live stream.
- **Stage 3 — web UI.** Done. Vite + Vue 3 SFC served from the local server,
  responsive, live-updating over SSE. Five pages: Dashboard, Work, Context,
  Agents, and Settings. The control plane in a browser.
- **Stage 5 — agent orchestration.** Done. RepoOS spawns coding agents
  (opencode, Claude Code, Qwen, Codex) in isolated git worktrees per task,
  streams their output over SSE, supports follow-up messages and session resume,
  and moves completed work into review. The Agents page configures CLI, model,
  and custom instructions per role. Freeform task creation drafts structured
  specs through the PM agent. Human sign-off is always the gate.

  This stage is actively being hardened: agent-visible worktree previews,
  context packs to bootstrap agents faster, and sandboxed agent handoff are in
  flight (see `work/` for current status).

- **Auth — optional bearer token.** Done. Defense-in-depth so the server isn't
  naked when exposed beyond localhost. Optional; localhost stays zero-friction.

- **Test suite.** Significant coverage in place: frontmatter round-trip tests,
  live-index diffing, agent drivers, and a full UI smoke test. The `repoos check`
  gate runs the test suite as part of the definition of done. Coverage continues
  to expand with each feature.

## Where we're going

Near-term, tracked as tasks in `work/`:

- **Stage 4 — deployments / environments.** A read-only panel surfacing deploy
  and infra status (Railway, Cloudflare Pages). Show state, never trigger
  deploys. Optional integrations that hide gracefully without credentials.

- **Hardening — continuing.** The system is fully wired and self-hosted. Current
  hardening targets include: making agent previews server-owned (not per-task),
  generating cached context packs to reduce agent startup time, and improving
  sandbox handoff for Codex and similar sandboxed agents.

- **Post-orchestration capabilities.** Scheduling and recurring tasks (#0093),
  per-task agent/model overrides, skill-to-agent binding, and evidence-based
  agent telemetry (CPU, memory, stall detection).

Further out, lower resolution on purpose:

- A lightweight CI-like checker that runs `repoos check` on every commit and
  posts results to a task — keeping the definition-of-done gate without
  requiring a separate CI system.
- Agent-to-agent handoff: a reviewer agent reviews an engineer agent's output
  before the human sees it, catching obvious issues and saving human review
  cycles.
- Collective context views: a surface that shows task relationships, dependency
  chains, and work-in-flight across the repo — a system-level view of the full
  task graph.

## What's deliberately *not* on the roadmap

Things that would pull RepoOS away from its principles, recorded so the absence
is intentional rather than an oversight:

- A hosted/SaaS version, accounts, or multi-tenant infrastructure.
- Heavy PM features — story points, gantt charts, roadmap-as-product,
  enterprise workflow configuration. These coordinate large human orgs; RepoOS
  is for small expert teams directing agents.
- Anything that makes the repo *not* the source of truth.

## How this doc stays honest

This roadmap describes intent and sequence, not status. It should change when the
*direction* changes — a stage added, dropped, or re-ordered — not when a task
moves across the board. If you find yourself updating this file to reflect that a
task started or finished, stop: that belongs in `work/`. Keep this document at
the altitude where it doesn't compete with the task board.

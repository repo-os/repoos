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
  index, and the `repoos` commands (`init`, `list`, `show`, `mv`, `new`, `index`).
- **Stage 2 — local server.** Done. In-memory live index, file watcher, JSON
  API, and an SSE event stream. Human edits, CLI edits, and agent file edits all
  converge into one live stream.
- **Stage 3 — web UI.** Done. Served from the local server, responsive, updating
  live over SSE. The control plane in a browser.

## Where we're going

Near-term, tracked as tasks in `work/`:

- **Editable tasks + AI-drafted creation.** Make the UI fully editable (body and
  metadata, not just status), then add a free-form entry flow where a human
  describes a task and an AI drafts the structured markdown for human review.
  Assets land in the repo as real files; AI drafting is optional and degrades to
  manual entry without a key.
- **Hardening — the test suite.** Vitest/`bun test` coverage on the highest-risk
  units: the frontmatter round-trip, the live-index diffing, and the safe-write
  merge. Deferred deliberately until the system was fully wired; now due.
- **Auth — optional bearer token.** Defense-in-depth so the server isn't naked
  when exposed beyond localhost. Optional; localhost stays zero-friction.
- **Stage 4 — deployments / environments.** A read-only panel surfacing deploy
  and infra status (Railway, Cloudflare Pages). Show state, never trigger
  deploys. Optional integrations that hide gracefully without credentials.

Further out, lower resolution on purpose:

- **Stage 5 — agent orchestration.** Spawn agents in dedicated git worktrees per
  task so parallel agents don't collide, stream their output into the live event
  system, write results back as normal commits. This is the payoff the whole
  architecture points at — and the stage with the most unresolved design, so it
  stays in `inbox` until the approach is settled (notably: how a distributed team
  treats the git remote as truth rather than a single host's working copy).

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

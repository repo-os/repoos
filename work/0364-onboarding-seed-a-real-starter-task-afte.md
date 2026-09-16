---
id: "0364"
title: "Onboarding: seed a real starter task after repoos init instead of leaving Ready empty"
type: feature
status: done
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/onboarding-seed-a-real-starter-task-afte
created_at: "2026-09-16T03:38:14Z"
updated_at: "2026-09-16T06:07:22Z"
---
## Problem

With 0001 now correctly shipped as `done` (it was a self-verifying task with
zero remaining work — see the commit that fixed this), a fresh `repoos init`
leaves the `ready` column completely empty. That's honest, but it's also a
dead end: a new user (or their first agent) has nothing to actually pick up,
and the guided new-project flow's one-line project description (asked at
`src/commands/init.ts:474`, e.g. "Welcome to Squishy! We'll build it using
vue3, vite, bun, capacitor/ionic...") currently only gets embedded as
decorative text in 0001's Overview section (`SAMPLE_TASK`, same file) — it
never turns into anything actionable.

## Investigate before designing anything new

A real run of the guided flow (project "squishy", 2026-09-15) ended up with
task 0002 titled "please read the project description, it m[ight...]" and
tasks 0003–0011 as concrete scaffold tasks (monorepo tooling, web app
scaffold, design system, backend API, database, mobile scaffold, testing
infra, deployment, docs) — i.e. the one-line description DID eventually turn
into a real task backlog in that instance. Before building anything, find out
how that actually happened: was it `autoEngineeringMode`, a PM-agent dispatch
that runs automatically after init, or did a human/agent manually hand the
description to the PM chat after the fact? Check
`autoEngineeringMode`'s default (`src/core/config.ts`) and whether anything in
`init.ts` or the server boot path triggers a PM run automatically. If a
mechanism already exists and squishy's outcome was organic, this task is
about making that mechanism reliable, visible, and part of `repoos init`
itself — not about building a second, parallel way to do the same thing.

## Two different first moves — new project vs. existing repo

`repoos init`'s two paths need different starter content, because they start
from different information:

- **New project (the guided flow, outside a git repo)** — already collects a
  one-line description. Instead of only decorating 0001's Overview, seed a
  real `ready` task (something like "Flesh out the product vision and initial
  architecture") whose body embeds that description and instructs whichever
  agent (or human) picks it up to ask clarifying questions about stack/scope/
  priorities, then turn the answers into `docs/` content and a handful of
  concrete next tasks via `repoos new`. This is a static task file written at
  scaffold time (like 0001 already is via `ensureFile`) — `repoos init` runs
  before any server exists, so it cannot call the freeform-task HTTP path
  (`POST /api/tasks/freeform`) or the PM agent directly; the task's own body
  is the prompt for later, once a server and an agent are actually running.
- **Existing repo (`repoos init` inside an established codebase)** — collects
  no description at all today. Seed a different `ready` task: "Read this
  codebase and propose docs/ + an initial task backlog," instructing the
  agent that picks it up to actually scan the repo (structure, stack,
  existing conventions) and produce something concrete — real `docs/` content
  and real starter tasks — rather than leaving a human staring at an empty
  board with no sense of what a task looks like for their own project.

## Constraints

- Do not touch task 0001's own content or status again — that's already
  fixed and out of scope here.
- The new starter task(s) must be genuinely actionable on their own (clear
  enough that a human working alone, with no AI agent at all, could also make
  progress on them) — RepoOS supports human-only usage, so don't write a task
  body that only makes sense if an agent is available.
- Follow the existing task-ID numbering scheme used by `scaffoldInto`
  (`src/commands/init.ts`) — check how IDs are currently assigned for 0001
  and any other scaffolded files before hardcoding "0002".
- Existing-repo detection already exists (`repoos init` distinguishes "not a
  git repo" from "existing repo, no RepoOS yet" from "already set up" — see
  `cmdInit`) — reuse that branching rather than re-deriving it.
- Keep the task bodies honest about what they are: don't write instructions
  that overpromise what a single task can accomplish (e.g. don't imply a full
  architecture gets designed automatically with no back-and-forth).

## Acceptance criteria

- [ ] Documented finding on how squishy's 0002–0011 backlog actually got
      created, and whether this task should build on that mechanism or
      introduce a new one (with reasoning either way).
- [ ] A fresh `repoos init` (guided new-project flow) leaves at least one
      concrete, actionable `ready` task on the board beyond 0001 — the board
      is never empty immediately after init.
- [ ] `repoos init` inside an existing repo (not the guided flow) seeds an
      appropriately different starter task reflecting that there's already a
      codebase to read, not a blank slate to describe.
- [ ] Both starter tasks are genuinely workable by a human alone, not only by
      an AI agent.
- [ ] Verified with a real scratch run of both `repoos init` paths (new
      project and existing repo), same way the 0001 fix was verified.
- [ ] `repoos check` passes.

## Related

- The task-0001-done fix (`fix(init): scaffold task 0001 as done, not ready`)
  — the fix that made this task's problem statement true; read that commit
  for context on `SAMPLE_TASK`/`scaffoldInto` in `src/commands/init.ts`.

## Activity

- 2026-09-16T03:38:14Z · created · unknown
- 2026-09-16T03:52:46Z · status inbox→ready
- 2026-09-16T05:45:23Z · status ready→active, branch
- 2026-09-16T05:59:32Z · status active→review
- 2026-09-16T06:07:22Z · status review→done, release:success

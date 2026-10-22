---
id: "0930"
title: Bind dev and check processes to explicit environments
type: feature
status: review
human_step_decision: agent
human_step_decision_key: a1c4ab9e
priority: p1
area: [core, server]
story: Secrets and project environments
depends_on: ["0927", "0928"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bind-dev-and-check-processes-to-explicit
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T08:06:43Z"
updated_at: "2026-10-22T17:37:45Z"
---
## Problem
Named environment files are useful only if each dev target, preview, and check receives the selected values safely. Implicit inheritance or mutation of the RepoOS server process could mix two targets’ values, expose production by fallback, or change current behavior for projects that have not opted in.

## Desired UX
A user explicitly binds each supported local target/run to a named environment and sees its consumers and restart-needed state. Concurrent targets can run against different environments without crossover. An unconfigured project retains current behavior, and managed agents/worktrees/remote validation receive no project values unless an explicit grant allows it.

## Acceptance criteria
- Add explicit environment selection for supported dev targets, previews, and check runs, with persisted binding semantics documented; the Secrets-page selector alone must not change a binding.
- Construct a per-child process environment from only the selected environment and that consumer’s required/granted keys; never mutate the RepoOS server global process.env with arbitrary project values.
- Preserve existing worktree inheritEnv behavior when named environments are unconfigured; keep machine/service variables read-only and prevent them from silently overriding an explicitly selected project environment.
- Never fall back to production when a development key is missing. Missing grants remain missing; expose effective source and consumers for the Secrets page, plus restart-needed state when a binding/value change requires restart.
- Tests run two targets concurrently with distinct fake values and prove no crossover; cover missing values, explicit grants, production non-fallback, legacy inheritEnv behavior, and that remote jobs receive no ungranted project values.
- No live credentials, external accounts, or runtime dependency are required.

## Notes for AI
Depends on #0927 for the storage/environment contract and #0928 for authorized metadata and mutation semantics. Inspect existing dev-target, preview, check, worktree, and remote-validation environment construction before selecting wiring points. Keep deployment provider bindings out of this slice. Update the relevant process/environment docs and tests. A local process environment is not an isolation boundary for unrestricted local agents; describe precisely what the grant mechanism enforces.

## Activity

- 2026-10-22T08:06:43Z · created · njachowski@gmail.com
- 2026-10-22T17:07:39Z · status inbox→ready
- 2026-10-22T17:07:46Z · cli_override, model_override
- 2026-10-22T17:07:47Z · status ready→active, branch
- 2026-10-22T17:15:37Z · body
- 2026-10-22T17:17:19Z · body
- 2026-10-22T17:32:20Z · status active→review
- 2026-10-22T17:32:21Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-22T17:37:45Z · note: review pass 1: needs some work

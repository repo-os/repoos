---
id: "0679"
title: "Close-out reliability: sensible default timeout, and hand merge/semantic conflicts back to the engineer automatically"
type: feature
status: inbox
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:40Z"
updated_at: "2026-10-05T17:16:54Z"
---
## Problem

- Default `closeOut.timeoutMs` is 6 minutes; for a small 3-package Bun monorepo on a laptop also running agents the gate took longer under load (typecheck alone 266 s at load average ~190), so Move to done failed "timed out ... retry when the runner is less loaded". The budget is wall-clock, so a closed lid or lost Wi-Fi counts too (a job spent 19 min wall clock on a 6 min budget).
- Two parallel tasks touching a shared file (`App.vue`, `bun.lock`) conflict at close-out; RepoOS retries twice, records "handoff failed - merge conflict unresolved" and leaves the task in `review` with nobody assigned.
- A SEMANTIC conflict (task A renames a shared test helper; task B cut earlier adds callers) merges clean and fails the gate with `X is not a function`; the engineer gets nothing useful.
- Sending a follow-up message to a task in `review` leaves it in `review`: the engineer fixes things and requests handoff, nothing commits it, and Move to done refuses (dirty worktree).

## Desired UX

- Default timeout scales from the last successful gate duration (e.g. 3x, minimum 10 min) and ignores system sleep; show gate duration in the task.
- On a merge conflict or a gate failure of a branch that passed its own check, automatically move the task back to `active` and message the engineer with the conflict list/failing output and the instruction "merge main, resolve, re-run, hand off". Lockfile conflicts are resolved by regenerating.
- A message to a task in `review` moves it to `active` (or is rejected with an instruction to do so).

## Acceptance criteria

- Tests for each scenario above; docs/close-out-pipeline.md updated. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T16:58:40Z · created · unknown
- 2026-10-05T17:16:53Z · story
- 2026-10-05T17:16:54Z · body: section Story context

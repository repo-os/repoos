---
id: "0695"
title: "Finish #0694 follow-ups: AGENTS.md remote self-check wording, task attribution for cli Runs rows, WIP-checkpoint tests, load measurement"
type: chore
status: inbox
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T01:38:21Z"
updated_at: "2026-10-06T01:38:21Z"
---
## Problem

Follow-ups left over when #0694 (engineer self-checks on remote runners) was approved on 2026-10-06 after two review rounds. The core behaviour is done and tested; these were the reviewer's open non-blocking items:

1. AGENTS.md (Definition of done) and any user-docs line still describe `repoos check --changed main` as a fast LOCAL pre-review pass. With remote validation on, scoped checks and managed-engineer self-checks run on a runner; also tell engineers to run `repoos check` once before handoff, not after every edit (engineers re-ran it 15-20 times per task overnight, each leaving a WIP checkpoint commit).
2. Local phase=cli rows in Checks > Runs still show no task when the engineer shell has no REPOOS_TASK_ID (191 such rows in 12 h): derive the task from the worktree branch in src/core/check-store.ts (or the recording path) when the env is missing; show it in the Runs list.
3. Tests for `commitWipCheckpointForRemoteGate` and the managed-engineer fallback messaging (check.ts yellow paths).
4. Measure local load before/after with 3 parallel engineers (acceptance item waived at approval) and note numbers in the task: before = load average 20-86 with 4-5 agents, swap 9 GB of 10 GB used.

## Desired UX

All four items done; no behaviour change beyond item 2 (task shown in Runs).

## Acceptance criteria

- AGENTS.md and user-docs match the current remote self-check behaviour; tests for item 3; Runs rows carry a task for cli-phase checks run inside a task worktree; load numbers noted. `repoos check` passes.

## Notes for AI

Read #0694 first (work/0694-*.md, its Driver note and review feedback sections) and docs/remote-validation.md. Small task.

## Activity

- 2026-10-06T01:38:21Z · created · unknown

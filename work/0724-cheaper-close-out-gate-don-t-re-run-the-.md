---
id: "0724"
title: "Cheaper close-out gate: don't re-run the full suite on what the handoff gate already proved"
type: feature
status: active
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/cheaper-close-out-gate-don-t-re-run-the-
created_at: "2026-10-06T15:55:13Z"
updated_at: "2026-10-07T09:47:15Z"
---
## Problem

Every Move to done re-runs the FULL gate on a candidate worktree: install, build, lint and the whole test suite (~420 test files, ~5,100 tests, about 230-290 s of tests plus install/build, so a healthy remote close-out is ~285 s median and a bad one is 20-40 min). The same commit already passed the identical full gate at handoff (pre-review remote gate, ~290 s median). On 2026-10-06 close-out was where most of the wall time went, and a flaky test failing it meant a fresh 5+ minute attempt each time (agent-review.test.ts failed four close-outs/gates).

Close-out is not strictly redundant: the candidate is the branch MERGED with current main, so it can differ from what the handoff gate tested when main moved. That is the part that needs checking, not the whole suite again.

## Desired UX

- At close-out, compare the candidate tree with what the handoff gate validated (the lock sha / tested tree). If the merge into main was trivial (main only advanced with bookkeeping, or the candidate tree equals the tested tree), SKIP the full suite: run only the cheap steps (build/typecheck, lint/format, task-asset guard) and record 'full suite reused from handoff check <run id/sha>'.
- If main moved with real code changes, run a SCOPED suite: the tests affected by the union of (files changed by the task) and (files changed on main since the tested base), via the existing --changed <ref> machinery (#0695), plus build/lint. Keep an escape hatch: setting closeOut.gate = full | scoped | reuse (default scoped), a Settings control, and 'full' always for releases and for machinery paths a repo declares (e.g. [[check.fullSuitePaths]]).
- Any failure falls back to the full suite once before failing the close-out (so a scoped miss costs time, not correctness).
- The run record states which mode ran and why (reused / scoped N files / full), so it is auditable in the Checks tab.

## Acceptance criteria

- Tests: identical tree -> reuse (no test step run); bookkeeping-only drift -> reuse; real code drift -> scoped run with the right --changed base; machinery path or release -> full; scoped failure -> full retry; setting honoured.
- Measure and record before/after median close-out time in the task notes. Settings control + docs (docs/close-out-pipeline.md, user-docs/check.md). repoos check passes.

## Notes for AI

VERIFY the assumption first: confirm from src/server/integration-orchestrator.ts what the close-out validate step runs today and whether the candidate tree can be compared to the handoff-tested tree (lock sha, check_runs.candidate_sha in checks.db). If skipping is unsafe for some reason, say so in the task and implement only the scoped mode. Related: #0717 (smaller uploads), #0720 (slow-run alert), #0679 (close-out reliability), #0695 (scoped remote self-checks).

## Activity

- 2026-10-06T15:55:13Z · created · unknown
- 2026-10-07T09:47:13Z · status inbox→ready
- 2026-10-07T09:47:15Z · status ready→active, branch

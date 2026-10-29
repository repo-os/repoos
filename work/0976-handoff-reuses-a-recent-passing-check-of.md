---
id: "0976"
title: Handoff reuses a recent passing check of the same tree instead of re-running tests
type: feature
status: ready
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: codex
model_override: gpt-6.1-sol
created_at: "2026-10-29T05:51:30Z"
updated_at: "2026-10-29T05:52:02Z"
---
## Problem
The server's handoff check re-runs the test suite even when the engineer's own `repoos check --changed main` just passed on the exact same commit. Under load the repeat run is what fails: on 2026-10-29 #0971's handoff check timed out at the 40-minute test limit and #0955's sat 40 minutes behind a stuck typecheck, although both engineers' own checks had passed in minutes (check_runs 9822, 9823). The driver had to land both by hand.

## Desired UX
Handoff reuses a recent passing check of the same tree instead of repeating it, so a task reaches review minutes after the engineer's check passes.

## Acceptance criteria
- When `check_runs` has a passing run for this task whose tree (commit + clean worktree) equals the handoff commit, and whose scope covers `changed:main` against the current main merge base, handoff records "reused check <id>" and skips the tests step. Cheap steps (format, lint, build staleness, task assets) still run.
- Any difference (new commit, dirty tree, main moved with source changes, older than a configured age) runs the check as today. Fail closed: if the comparison cannot be made, run the full handoff check.
- The handoff transcript and Checks page say which run was reused.
- Tests for: reuse on an identical tree; no reuse after a new commit; no reuse after main moved with source changes; fail-closed on a lookup error.

## Notes for AI
`src/server/handoff.ts` (runCheck), `src/core/check-store.ts` (check_runs has worktree, candidate_sha, scope, outcome). Engineers' self-check runs may not record candidate_sha today; record it. Do not edit repoos.toml.

## Activity

- 2026-10-29T05:51:30Z · created · njachowski@gmail.com
- 2026-10-29T05:51:43Z · cli_override, model_override
- 2026-10-29T05:52:02Z · status inbox→ready

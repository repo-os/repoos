---
task: "1061"
pass: 2
at: "2026-11-08T17:29:16.196Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "476c60dd7:"
---
## Relevance
still relevant — #0954 covers task-file drift; neither it nor nearby check work covers these broader gate protections.

## Evidence
None

## Bugs
- **Source-write protection is not wired, and the drift exception can let source changes pass.** `src/server/check-gate-lock.ts:383-409` defines the source-path refusal helpers, but they have no writer call sites; `src/server/agents.ts:7374, 7923` only prevent starting another engineer turn. Existing processes can still edit the worktree. Further, `src/core/check-gate-bookkeeping.ts:57-60` allows drift when every commit is a WIP checkpoint—even when the changed paths include source—contrary to the rule that source changes invalidate the check. The tests exercise the helper, not actual write attempts.

## Edge cases
Only the round-1 engineering report exists; its source commit `e325ad0` predates reviewed HEAD `476c60d`, so there is no current-round report to weigh. Tests call dead-lock reconciliation directly but do not exercise server restart or pass/fail/cancel teardown end to end.

## Suggestions
None

## Verdict
needs some work — source edits remain possible during gates, and WIP source commits can be exempted from drift detection.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


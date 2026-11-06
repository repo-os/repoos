---
task: 1041
pass: 5
at: "2026-11-06T09:50:48.657Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "e0ab23c30:e0ab23c30"
---
## Verdict
needs some work — manual runs can create pre-merge reports, and background commits can race close-out.

## Relevance
still relevant — `main` has no post-merge PM summary implementation.

## Evidence
`auto: matched src/ui-app/**` (`/`, `default-1.png`) shows the Control dashboard, not the task drawer’s Report view; the visual acceptance criterion remains unverified.

## Bugs
- **Lifecycle gating:** `postTaskSummary` (`src/server/routes/tasks.ts:4093-4097`) queues any task, and `runTaskSummaryNow` (`src/server/task-summary.ts:362`) does not require `done`. The CLI also says it works on any task (`src/commands/control-api.ts:1784-1792`). This can commit a “post-merge” report for an active or review task with incomplete facts. The automatic path has the same class of gap: it queues even after release marking fails or the task file cannot be found (`src/server/integration-orchestrator.ts:4359-4377`). Require a released task for manual runs and queue automatically only after release succeeds.
- **Publication race:** `runTaskSummaryNow` commits to the main checkout via `commitFiles` (`src/server/task-summary.ts:412`), which does not acquire the close-out publication/root lock. If summary generation finishes during another publish, its Git operations can contend with the landing’s shared index/ref and cause that landing to fail or retry. Serialize this bookkeeping commit with publication.

## Edge cases
None found

## Suggestions
None found

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-06T09:46:27.594Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


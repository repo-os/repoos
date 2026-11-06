---
task: 1041
pass: 14
at: "2026-11-06T22:38:29.886Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "2d3c488cb:2d3c488cb"
---
Repeated review classes: Dispatch/fallback, locking/rollback, changed-file reporting, linked-task facts, summary validation, and mtime-based retry polling are fixed; status/report-state failures remain incomplete. A human should review this recurring failure-path pattern.

## Verdict
needs some work — a failed pending-status write can make a retry return the old report as success.

## Relevance
still relevant — main has no task-summary implementation, and nearby work does not supersede it.

## Evidence
None

## Bugs
- **Status/report state divergence:** `queueTaskSummary` ignores a failed pending-status write and starts the job anyway (`src/server/task-summary.ts:873-889`). If an older summary exists, the API/CLI can treat the unchanged `idle` or `done` status as terminal and report success before the retry finishes (`src/commands/control-api.ts:1793-1808, 1900-1907`). Also, a persisted `done` status remains `done` when the report is missing or unreadable (`src/server/task-summary.ts:276-290`); CLI reports success, while the drawer hides the error because it only renders the summary block for a report, `pending`, or `failed` (`TaskDrawer.vue:6441-6461`). The status-write test checks logging only, not these outcomes (`task-summary.server.test.ts:522-535`).

## Edge cases
None found

## Suggestions
The handoff capture is nonblank, its assertions passed, and no console errors were recorded, but it shows only an engineering report on a task still in review—not a rendered post-merge summary. Capture a summary-bearing drawer state to verify that acceptance criterion.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-06T22:35:48.543Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


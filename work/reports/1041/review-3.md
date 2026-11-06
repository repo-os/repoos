---
task: 1041
pass: 3
at: "2026-11-06T07:09:57.503Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "6595e997d:e20a07587"
---
## Verdict
needs some work — automatic coverage, linked-task facts, word validation, and drawer refresh have gaps.

## Relevance
still relevant — no existing post-merge summary implementation was found on the base branch.

## Evidence
None

## Bugs
- **Post-merge dispatch coverage:** `src/server/integration-orchestrator.ts:4375-4376` skips queueing if the live index lacks the task, despite cleanup already having a disk-lookup fallback for release. Also, the branchless done path in `src/server/routes/tasks.ts:3042-3047` releases the task without queueing a summary. Both paths can complete successfully without generating one.
- **Automatic facts omission:** `src/server/integration-orchestrator.ts:4376` always passes `[]` for linked tasks, so automatically generated reports omit dependencies and dependents; only a manual retry supplies the task list.
- **Word-limit bypass:** `src/core/task-summary.ts:41` excludes everything after the first matching “Changed files” heading, wherever it appears. A heading in the PM narrative lets subsequent narrative words evade the 2,000-word check.
- **Drawer state goes stale:** `src/ui-app/src/components/TaskDrawer.vue:4363-4378, 4412-4425` loads the summary once per task/status change. If it loads `pending`, no refresh occurs when generation finishes, so the open drawer stays pending until reopened.

## Edge cases
Earlier review passes timed out; there are no prior findings to verify.

## Suggestions
The handoff capture is current but shows a loading skeleton at `/`, not the task drawer or summary. Recapture the Report pane with a summary state; the current image does not verify the UI change.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-06T06:26:43.006Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


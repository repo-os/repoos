---
task: "1277"
pass: 2
at: "2026-11-22T13:09:25.552Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/hide-the-stale-evidence-prompt-once-a-ta
state: ok
tree_identity: "2327cdc6c:2327cdc6c4"
---
## Verdict
needs some work — queued close-outs still allow `repoos verify` to start an evidence refresh.

## Relevance
still relevant — the base branch does not contain this fix, and nearby close-out tasks do not solve this prompt issue.

## Evidence
None

## Bugs
- **Class: Queued close-out verify guard** — `src/server/routes/tasks.ts` checks only `closeOutLock.closingOut()` in `refreshTaskEvidence`; when the task is queued but not active, `repoos verify` reaches the capture path and can start a review mid-close-out. The same active-only check is passed to automatic stale-evidence and evidence-gap refresh paths, so they also lack a queued-job guard.
No further findings of this class were found after grepping: `src/server/routes/tasks.ts` refresh handlers, `src/server/server.ts` callback wiring, `src/server/integration-job.ts`, `src/server/integration-status.ts`, `src/commands/control-api.ts`, `src/ui-app/src/stores/repo.ts`, `src/ui-app/src/lib/integration-pipeline-ui.ts`, component callers, and `src/ui-app/tests/refresh-evidence-route.test.ts`.

## Edge cases
The engineering report’s source commit matches the reviewed implementation; later commits are bookkeeping. `git merge-tree` reports a conflict only in this task’s own work file; the server landing checklist says close-out resolves it from main.

## Suggestions
The `/work` capture is route-matched and nonblank, but the integration popover covers the card footer, so it does not show whether the stale-evidence prompt is hidden. Recapture with the popover dismissed; consider adding a drawer-specific queued-state test. No new bare `node`, `npm`, or `npx` invocation found.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T13:07:45.034Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


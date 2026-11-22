---
task: "1277"
pass: 1
at: "2026-11-22T12:50:10.018Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/hide-the-stale-evidence-prompt-once-a-ta
state: ok
tree_identity: "2327cdc6c:5e6519dfea"
---
## Relevance
still relevant — the base branch does not contain this UI fix, and the task’s premise still holds.

## Evidence
The `/work` capture is route-matched and nonblank, but the integration popover covers the card footer, so it does not visibly prove the notice and button are absent.

## Bugs
- **Class: Queued close-out verify guard** — `src/server/routes/tasks.ts:1703` checks only whether a close-out is active. A task still queued can pass `POST /api/tasks/:id/verify` and start an evidence refresh before its close-out runs, contrary to the task’s CLI requirement.
No further findings of this class were found after grepping: `src/server/routes/tasks.ts` evidence-refresh paths and handler, `src/server/integration-job.ts`, `src/server/integration-status.ts`, `src/commands/control-api.ts`, and the UI helper and its callers.

## Edge cases
The engineering report’s source commit matches the implementation; later branch changes are bookkeeping. The landing checklist reports only the task’s own work file conflicts with main, which close-out resolves from main.

## Suggestions
Recapture with the integration popover moved so the card footer is visible. Add a drawer-specific queued-state test; current drawer coverage exercises validating and failed states.

## Verdict
needs some work — queued close-outs still allow `repoos verify`; the capture also obscures the affected card footer.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T12:48:35.286Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


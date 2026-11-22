---
task: "1277"
pass: 3
at: "2026-11-22T13:47:21.107Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/hide-the-stale-evidence-prompt-once-a-ta
state: ok
tree_identity: "0ad964649:2327cdc6c4"
---
## Verdict
needs some work — STALE-EVIDENCE-ONLY; the required UI capture is stale, obscured, and shows validating rather than queued.

## Relevance
still relevant — the base branch does not contain the queued-close-out UI or verify guard.

## Evidence
The declared `/work` capture is for tree `2327cdc6c`, not reviewed HEAD `0ad964649`. Its overlay obscures the card footer, and its fixture shows `validating`, not the declared queued state.

## Bugs
None found
No further findings of this class were found after grepping: `src/server/routes/tasks.ts`, `src/server/server.ts`, `src/server/integration-job.ts`, `src/server/close-out-lock.ts`, `src/server/request-close-out.ts`, `src/commands/control-api.ts`, the UI helper and its TaskCard/TaskDrawer callers, and the related server/UI tests.

## Edge cases
The prior queued-verify finding is fixed: the route rejects a pending task job, and both automatic refresh paths check the queued-job callback. The engineering report is stale (`sourceSha` `5e6519d`, versus HEAD `0ad964649`); no current-round engineering report is present. `git merge-tree` reports a conflict only in this task’s own work file, not source files.

## Suggestions
Recapture on the reviewed tree with the card footer visible and a genuinely queued fixture. No new bare `node`, `npm`, or `npx` invocation found.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T13:07:45.034Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


---
task: "1185"
pass: 7
at: "2026-11-18T19:05:12.923Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/restart-now-button-does-nothing-on-a-sys
state: ok
tree_identity: "2368e8b2c:4115c29599"
---
Repeated review classes: supervisor restart routing, detection test coverage, and UI evidence gaps are fixed in the current code; the latest detection fallback issue is also fixed. A human should look at the recurring pattern of fallback logic running only when a command fails.

## Verdict
needs some work — STALE-EVIDENCE-ONLY; the required captures were made on an earlier tree.

## Relevance
still relevant — The task’s renamed systemd service detection and restart behavior remain the changes this branch addresses.

## Evidence
- Restart notice showing progress: capture is for tree `4c831fb735`, not reviewed HEAD `2368e8b2c`.
- Restart notice showing a service error: capture is for tree `4c831fb735`, not reviewed HEAD `2368e8b2c`.

Both images show the intended notice state, and the recorded verification reports the expected app route with no console errors. They do not verify the reviewed HEAD.

## Bugs
None found
No further findings of this class were found after grepping: `src/core/supervisor-detect.ts`, `src/core/supervisor-detect.test.ts`, `src/core/server-restart.ts`, `src/core/server-restart.test.ts`, `src/core/server-restart-classify.test.ts`, `src/server/routes/info.ts`, `src/ui-app/src/components/ReleaseUpdateNotification.vue`, `src/ui-app/src/components/DecisionDigestPanel.vue`, `src/core/shot-fixtures.ts`, and the launchd, cgroup, and systemd-parent fallback paths.

## Edge cases
The current detector checks cgroup and parent fallbacks when systemd status succeeds but is unparseable, with regression coverage for a `user@1000.service` status. The QA note explicitly says real hand-run restart was not performed. The engineering report is stale: its source commit is `4115c295`, not the reviewed HEAD. `git merge-tree --write-tree main HEAD` could not run because the environment denied temporary-file creation; the supplied landing checklist reports only the task’s own work file conflict, handled from main at close-out.

## Suggestions (non-blocking)
None.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T18:45:15.547Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


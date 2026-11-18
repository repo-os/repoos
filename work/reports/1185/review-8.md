---
task: "1185"
pass: 8
at: "2026-11-18T19:18:29.364Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/restart-now-button-does-nothing-on-a-sys
state: ok
tree_identity: "2368e8b2c:2368e8b2ca"
---
Repeated review classes: supervisor restart routing, supervisor detection fallback handling, and UI evidence gaps are fixed; the latest capture matches the reviewed code tree. A human should look at the recurring pattern of fallback logic running only when a command fails.

## Verdict
good to go — No code defects found; merge check was blocked by the environment, and the server reports only the task-file conflict.

## Relevance
still relevant — The renamed systemd process can now be identified from its cgroup or parent and restarted through its supervisor.

## Evidence
None

## Bugs
None found
No further findings of this class were found after grepping: `src/core/supervisor-detect.ts`, `src/core/supervisor-detect.test.ts`, `src/core/server-restart.ts`, `src/core/server-restart.test.ts`, `src/core/server-restart-classify.test.ts`, `src/server/routes/info.ts`, `src/ui-app/src/components/ReleaseUpdateNotification.vue`, `src/core/shot-fixtures.ts`, and the launchd, cgroup, and systemd-parent fallback paths.

## Edge cases
The QA note says a real hand-run restart was not performed. Both screenshots are nonblank and show the declared progress and error states on the app route; verification records zero console errors and matches the reviewed implementation tree. `git merge-tree --write-tree main HEAD` failed because the environment denied temporary-file creation; the supplied landing checklist reports only the task’s own work file conflict, which close-out resolves from main. No new bare `node`, `npm`, or `npx` invocation was found in the changed restart paths.

## Suggestions (non-blocking)
None.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T19:17:00.906Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


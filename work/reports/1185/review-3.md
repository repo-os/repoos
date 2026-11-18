---
task: "1185"
pass: 3
at: "2026-11-18T14:44:48.234Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/restart-now-button-does-nothing-on-a-sys
state: ok
tree_identity: "ec7e0cbc0:60e5c32f26"
---
## Verdict
needs some work — the capture does not verify the required restart dialog behavior.

## Relevance
still relevant — Nearby restart work does not address this systemd detection failure.

## Evidence
The current `/` capture matches the app route and has no recorded console errors, but shows Mission Control rather than the restart dialog. It does not verify the progress label or error display.

## Bugs
None found
No further findings of this class were found after grepping: `src/core/supervisor-detect.ts`, `src/core/supervisor-detect.test.ts`, `src/core/server-restart.ts`, `src/server/routes/info.ts`, `src/ui-app/src/components/ReleaseUpdateNotification.vue`, `src/ui-app/tests/releases.test.ts`, `src/ui-app/tests/update-status.test.ts`, the launchd detection path, and the restart UI states.

## Edge cases
The added tests cover renamed managed services detected through cgroup and parent fallback, an external unit, a shell-parented hand-run process, and an uncertain systemd parent. The QA note correctly says no real hand-run restart was performed. The engineering report source commit differs from reviewed HEAD, but the supplied checklist says only task bookkeeping changed after that report.

## Suggestions
Capture the restart dialog with a fixture that exercises progress and error states.

## Verdict
needs some work — required restart UI behavior is not shown in the capture.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T14:43:51.862Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


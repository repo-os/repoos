---
task: "1185"
pass: 5
at: "2026-11-18T17:35:42.167Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/restart-now-button-does-nothing-on-a-sys
state: ok
tree_identity: "2e1083531:d33a26cf0b"
---
## Verdict
needs some work — systemd detection reaches a restart path that refuses or only signals the process; landing checklist also reports conflicts and foreign task files.

## Relevance
still relevant — The reported systemd restart failure is not fully addressed by the current restart routing.

## Evidence
None

## Bugs
- **Class: supervisor restart routing** — [src/core/server-restart.ts](/Users/nick/code/nick/repoos-worktrees/feat/restart-now-button-does-nothing-on-a-sys/src/core/server-restart.ts:522) does not explicitly restart the detected systemd unit. The new cgroup and parent fallbacks classify `com.repoos.serve.*` as `managed`; if `getServiceStatus(root)` does not identify that unit as RepoOS’s registered service, `classifyRestartPath` returns `refuse-supervised-unknown`, so Restart now fails instead of restarting it. For other detected external units, the restart path stops the PID and waits for a respawn rather than asking systemd to restart the unit. Route detected units through their supervisor’s restart command and verify the replacement server.
- **Class: landing blockers** — The supplied landing checklist reports conflicts in `work/1169-qa-pass-macos-repoos-hub-app-build-launc.md` and `work/1184-qa-pass-web-app-keyboard-and-accessibili.md`, and says those foreign task files are in this branch’s diff. They block landing until RepoOS heals the scope and conflict issues.

No further findings of this class were found after grepping: `src/core/supervisor-detect.ts`, `src/core/supervisor-detect.test.ts`, `src/core/server-restart.ts`, `src/core/server-restart.test.ts`, `src/core/service-manager.ts`, `src/server/routes/info.ts`, `src/ui-app/src/components/ReleaseUpdateNotification.vue`, and the external-supervisor and managed-service restart branches.

## Edge cases
The progress and error captures are nonblank, match the app route and declared fixtures, and show the intended dialog states. The recorded handoff reports zero console errors; its source differs from HEAD only by bookkeeping. The QA note truthfully says no real hand-run restart was performed.

## Suggestions (non-blocking)
None.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T17:34:26.413Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


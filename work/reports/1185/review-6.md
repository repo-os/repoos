---
task: "1185"
pass: 6
at: "2026-11-18T18:46:24.639Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/restart-now-button-does-nothing-on-a-sys
state: ok
tree_identity: "4c831fb73:4115c29599"
---
Repeated review classes: supervisor restart routing is fixed; supervisor detection test coverage and UI evidence gaps are fixed. The recurring pattern is that detection fallbacks only run on command failure; a human should check whether that pattern appears elsewhere.

## Verdict
needs some work — systemd can return an unparseable unit without throwing, bypassing the new cgroup and parent fallbacks.

## Relevance
still relevant — The reported renamed systemd service can still miss the intended supervisor restart path.

## Evidence
None

## Bugs
- **Class: supervisor detection fallback handling** — In [supervisor-detect.ts](/Users/nick/code/nick/repoos-worktrees/feat/restart-now-button-does-nothing-on-a-sys/src/core/supervisor-detect.ts), `detectLinuxSupervisor` checks cgroups and parentage only in `systemctl status`’s `catch` branch. If that command succeeds but reports an unparseable unit such as `user@1000.service`, the function returns `uncertain` instead of checking the target process’s cgroup. That can prevent the required systemd user-unit detection and restart. Add coverage for a successful status response naming the user manager while the process cgroup identifies the actual RepoOS unit.
No further findings of this class were found after grepping: `src/core/supervisor-detect.ts`, `src/core/supervisor-detect.test.ts`, `src/core/server-restart.ts`, `src/core/server-restart.test.ts`, `src/core/server-restart-classify.test.ts`, `src/server/routes/info.ts`, and the launchd detection path.

## Edge cases
The progress and error captures are nonblank, match the app route and declared fixture states, and show the intended notice. The recorded verification reports zero console errors and matches the reviewed implementation apart from bookkeeping. The QA note explicitly says no real hand-run restart was performed. `git merge-tree --write-tree main HEAD` could not complete because the environment denied temporary-file creation; the supplied landing checklist reports only the task’s own work file conflicts, resolved from main at close-out.

## Suggestions (non-blocking)
None.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T18:45:15.547Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


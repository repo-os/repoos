---
task: "1281"
pass: 4
at: "2026-11-20T19:50:48.964Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/tests-leak-git-worker-processes-one-vite
state: ok
tree_identity: "d65ea496b:"
---
## Verdict
needs some work — concurrent busy lanes can exceed the production cap without bound.

## Relevance
still relevant — main contains the task but no implementation addressing the worker leak or cap.

## Evidence
None

## Bugs
- **Class: Soft git-worker child cap** — `src/server/git-worker.ts`: `makeRoomForChild()` evicts only idle lanes, then `ensureChild()` launches anyway if all lanes are busy. Concurrent requests across many roots can therefore keep spawning children above four; `SIGKILL` also does not ensure an evicted process has exited before its replacement starts. The cap test exercises repositories sequentially and checks the internal lane count, not the process count under concurrent load. Both bulk and fast lanes share this spawn path.
No further findings of this class were found after grepping: `src/server/git-worker.ts` (both lanes and the sole spawn path), all `getGitWorker` callers under `src/server/`, `src/ui-app/tests/git-worker-process-cap.test.ts`, `src/ui-app/tests/setup/process-guard.ts`, and `docs/server-git-worker.md`.

## Edge cases
The engineering report’s source commit matches the implementation diff; later commits are task/review bookkeeping.

## Suggestions
None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


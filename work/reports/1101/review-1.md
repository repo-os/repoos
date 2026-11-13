---
task: "1101"
pass: 1
at: "2026-11-13T10:39:06.847Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/flaky-test-remote-host-pool-times-out-wh
state: ok
tree_identity: "daf72771a:"
---
## Verdict

`good to go` — Production queue scan and test fixture match the acceptance criteria; docs are in place.

## Relevance

`still relevant` — The early `break` in `hostLockShell` and the brittle test assumptions caused real failures under concurrent runs; this branch fixes both.

## Evidence

None

## Bugs

None found

## Edge cases

- The flaky test depends on queue files landing before the lock shell finishes its `sleep 0.2` pre-delay; under extreme scheduling delay the shell could grab a free slot on an empty queue first (failure mode is loud, not the old flake).
- Zero-wait timeout is now consistent on the acquire-gate loop (line 2509) and the post-scan tail (2559–2563), but the top-of-loop check at 2480 still requires `WAIT > 0` — only affects callers with `waitSecs: 0` and a held gate was the reported hang; new test covers that path.
- The spawned lock-shell wrapper is not killed on early assertion failure (Vitest teardown usually suffices).

## Suggestions

- Note in the doc that only the gate (and tail) loops treat `WAIT=0` as immediate timeout; line 2480 still gates on `WAIT > 0`.
- Consider `try/finally` to `SIGKILL` the wrapper child if setup assertions fail.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


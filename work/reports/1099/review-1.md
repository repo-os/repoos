---
task: "1099"
pass: 1
at: "2026-11-13T01:07:48.708Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/remote-validation-lock-waiters-leak-and-
state: ok
tree_identity: "6267a388f:"
---
## Verdict
`good to go` — Generated lock waiters now honor WAIT/DEADLINE while deferred, prune dead queue PIDs, exit on parent loss, and always tear down `wait/<pid>` via early EXIT traps.

## Relevance
`still relevant` — Directly addresses the ThinkPad orphan-waiter incident; nothing on `main` already fixes this leak class.

## Evidence
None

## Bugs
None found

## Edge cases
Parent-PPID check fails closed if `ps` is empty (exits 143). The “parent disappeared” test kills a supervisor `sh` while lock scripts stay under child `sh -c`, so cleanup within 6s may exercise WAIT=3 more than PPID change (real SSH runs the script under the session shell). Zombie queue PIDs are still “alive” to `kill -0`; deferral ends when the waiter’s own budget expires. `.reaping` retry still sleeps 1s without advancing `_rvwaited` (minor slack, pre-existing).

## Suggestions
None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


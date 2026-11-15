---
task: "1125"
pass: 1
at: "2026-11-15T05:40:46.795Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/fix-the-flaky-remote-host-pool-and-agent
state: ok
tree_identity: "f9bb7e6e9:"
---
## Verdict
`good to go` — Test-only stabilization with a narrow production probe path; causes documented; remote 50× fleet proof still pending human sign-off.

## Relevance
`still relevant` — Remote close-out was blocked by real test/host coupling; this branch removes those races without weakening production lock or guard behaviour.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `src/core/pressure-guard.ts`, `src/ui-app/tests/{pressure-guard,agent-review,agent-drivers,remote-host-pool}.test.ts`, `src/server/agents.ts` (`pressureProbe`), `docs/debugging-check-failures.md`.

## Edge cases
- Acceptance “50× under load on bee and thinkpad” was exercised locally (50× pressure relief, 20× lock trio, 25× resource limits) but not re-run on the remote validator fleet; fleet smoke after merge is the remaining AC gap.
- Holder/waiter lock case is unchanged here (#1118 `HOLDER_STARTED` on main); only the deferred-queue and orphan stale tests were touched in `remote-host-pool.test.ts`.
- Other `agent-drivers` cases still assert `start.ok` without draining `isQueued`; they wait on output length, unlike resource-limits which reads spawn env immediately.

## Suggestions
- After merge, one concurrent full gate on bee and thinkpad to close AC3 without another close-out surprise.

## Could not verify (environment)
- Remote-runner 50× soak; landing checklist merge WARN on task markdown only (close-out resolves from main). Reviewed HEAD `f9bb7e6`; implementation matches engineer report `70e5d21` plus bookkeeping commits.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


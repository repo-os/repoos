---
task: "1134"
pass: 1
at: "2026-11-15T19:34:41.273Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/engineer-test-runs-outlive-the-agent-tur
state: ok
tree_identity: "2f157a9a3:47f802c46c"
---
## Verdict

`good to go` — Turn teardown, control-plane sweeper, bounded test-helper sweep, pressure/CTO/UI wiring, and live + unit tests match the spec; handoff screenshot renders the declared fixture cleanly.

## Relevance

`still relevant` — The incident remains real; this branch adds the missing PID-tree, worktree-cwd, and marker layers called for in the spec.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `src/core/run-processes.ts`, `src/server/run-process-reaper.ts`, `src/server/agents.ts` (`finalizeTurn`, `running`), `src/server/server.ts`, `src/ui-app/tests/helpers.ts`, `src/ui-app/tests/run-process-teardown.test.ts`, branch diff for bare `node`/`npm`/`npx`.

## Edge cases

- Periodic sweeper skips reparented orphans whose cwd sits under a **live** turn’s worktree (`findOrphanedRunProcesses` live-workdir guard); survivors from a prior turn can burn CPU until that turn ends (documented macOS tradeoff).
- `repoos check` still ends via group reap only (`check-runner.ts`), not `reapAgentTurnProcessTree`; detached grandchildren from check are swept, not torn down synchronously.
- macOS cannot read foreign `REPOOS_TURN_MARKER`; marker path is Linux-only (live test covers cwd/`lsof`).
- Dashboard/pressure orphan list reflects the **last** 15s sweep (`RunProcessReaper.recent`), not a live census between ticks.

## Suggestions

- Add a unit case: stale ppid-1 orphan in worktree X while a live turn occupies X with a **different** marker — clarifies intentional deferral vs accidental leak.
- Expose `processGroupLeader` on `RunningAgentInfo` if adopt-after-reload ever diverges from `adoptedPid`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-15T19:32:26.210Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


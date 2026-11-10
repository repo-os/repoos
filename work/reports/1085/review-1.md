---
task: "1085"
pass: 1
at: "2026-11-10T17:33:47.429Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/stale-handoff-running-validate-record-ou
state: ok
tree_identity: "7f0ebd653:"
---
## Verdict
needs some work — the board card and CLI still misreport reconciled runs, recovery finalizations get superseded mid-check, and the report and UI evidence are missing

## Relevance
still relevant — `main` has no reconciliation of `running` handoff records, so the premise holds.

## Evidence
None. The code is not sound, so this is not an evidence-only verdict. The missing UI evidence is listed under Bugs.

## Bugs
**1. Live finalization without an in-flight claim gets superseded.** Class: lifecycle, a handoff writer whose caller never claims the slot.
- `src/server/post-handoff-checkpoint-recovery.ts` (`runRecoveryPipeline`, ~line 173) calls `finalizeReviewHandoff` without `markHandoffInFlight`. The task stays in `review`, and `isPostHandoffCheckpointRecoveryActive` is not part of `handoffLive`.
- While its checks run, the watchdog (`task-watchdog.ts:623-638`) or a GET (`routes/tasks.ts:5126`) sees `handoffLive: false` and `taskStatus: review`, and writes `superseded` ("task is already in review").
- The card then shows "REVIEW PASSED" and Move to done is enabled while checks still run.
- Fix: claim the slot in the recovery path, or add recovery-active to `handoffLive`.
- Other writers checked: `server.ts:3134` and the runner's `handoffTask` claim correctly.

**2. `superseded` falls through to "not requested" in the CLI.** Class: default-branch fallback on a state enum.
- `src/commands/control-api.ts:1743-1753` has no `superseded` branch, so `repoos handoff-status` prints "handoff: not requested". This breaks AC1 ("show the real state").
- `user-docs/cli.md:233` lists the states without `superseded`.
- The UI store (`repo.ts:953, 1510`) handles it. `stale` is not printed.

**3. Reconciled state never reaches the board.** Class: state written without a UI notification, with a poll gated on status.
- `TaskCard.vue:505-522` hydrates and polls handoff status only when `status === "active"`. Neither the watchdog nor the route emits an event on supersede.
- A card in `review` keeps the last fetched `running` record, so "CHECKS RUNNING" stays until the drawer opens or the page reloads. AC1 and AC2 are not met on the board.
- `repo.ts:1509` (`handoffInFlight`) keeps Move to done disabled for that record (`TaskCard.vue:609, 647`; `TaskDrawer.vue:846, 895-899`).

**4. A stale-flagged live record still blocks Move to done.** Class: a flag that gates nothing.
- `handoffInFlight` returns true for any `running` state, including `stale: true`. AC3 requires Move to done to be enabled when `repoos landable` is ready.

**5. Missing required context and UI evidence.**
- No engineering report exists under `work/reports/1085`. The draft at `.repoos/engineering-report-drafts/1085.md` is uncommitted. This is a new round, so it blocks sign-off.
- The task declares no `## Shots`, and there is no `ui-verification/1085.json`. AC2 is a visual criterion, so it is unverified.

## Edge cases
- The `stale` flag only fires when a live slot outlives the deadline timer. That timer settles the record as `failed` first, so the flag rarely triggers.
- A task moved out of `active`/`review` (for example back to `ready`) is never reconciled by the watchdog. Only a GET reconciles it.
- A handoff superseded by a newer review while its slot is still held keeps running. Move to done may be clicked while that handoff is still checking.
- A pending handoff retained on disk counts as live, so its record is never superseded.

## Suggestions
- Add tests for the watchdog and route wiring, the CLI `superseded` rendering, and the card's superseded branch. The current tests cover only the pure function.
- Emit a task event when a record is superseded so open boards refresh.
- No bare `node`, `npm` or `npx` was introduced.

## Verdict
needs some work — board/CLI misreport reconciled state, recovery runs get superseded, report and UI evidence missing

## Automated verification

- Browser console-error check (handoff evidence): **not run** — Required UI handoff browser verification has no stored evidence — console errors were not checked.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


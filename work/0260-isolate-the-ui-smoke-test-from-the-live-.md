---
id: "0260"
title: Isolate the UI smoke test from the live repo board
type: perf
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-19T18:55:42Z"
updated_at: "2026-08-19T18:56:20Z"
---
## Problem

`repoos check`'s UI smoke test (`src/commands/check.ts` → `runUISmokeTest()`)
calls `startPreviewServer()` (`src/commands/ui-harness.ts:61`), which boots a
FULL production `startServer()` rooted at the real repo (no `root` override
passed). That drags in every bit of live-board startup machinery that has
nothing to do with "does the built SPA render, no console errors" — job
recovery for interrupted agent runs, and preview auto-launch reconciliation
for every task currently in `active`/`review`.

Confirmed by directly timing `repoos check` in this repo: the smoke-test
phase logged multiple `[preview] auto-launch failed — preview server for
#0100 did not become ready` / `#0257 auto-launch failed` lines, each of which
blocks on a real readiness-timeout wait before giving up. This is:

- **Slow**: adds tens of seconds unrelated to the actual UI assertions,
  scaling with however many tasks happen to be active/review at check time —
  it gets *slower* as the board fills up, not stays constant.
- **Nondeterministic**: the smoke test's pass/fail and duration depend on
  unrelated board state (whether some other task's preview server happens to
  be flaky right now), which has nothing to do with whether the UI renders.
- **Wasteful**: none of this reconciliation work is needed to answer "does
  the built SPA mount, with no console errors."

## Desired UX

`repoos check`'s UI smoke test boots against an isolated, empty fixture repo
(a throwaway `work/` dir + minimal `repoos.toml`), not the live checkout —
identical in spirit to how the reload.ts and other tests already use
`mkdtempSync` fixtures. No job recovery, no preview auto-launch, no
dependency on what's currently on the real board. Check duration becomes
constant regardless of board size, and the smoke test becomes deterministic.

## Acceptance criteria

- [ ] `startPreviewServer()` in `src/commands/ui-harness.ts` accepts (or
      always uses) an isolated fixture root instead of defaulting to the
      real repo root when called from the smoke test.
- [ ] Running `repoos check` no longer logs any `[preview] auto-launch
      failed` / job-recovery lines during the UI smoke test phase.
- [ ] The smoke test still exercises real rendering: title check, mounted
      #app, Work/Settings navigation, the CSS utility-spacing regression
      guard — all currently-covered assertions keep passing.
- [ ] `disableAuth: true` (already set) is preserved so the smoke test can
      still reach the dashboard when the real repo has native auth enabled.
- [ ] `repoos check` duration on the UI smoke test phase no longer scales
      with the number of active/review tasks on the board.
- [ ] `repoos check` passes.

## Notes for AI

- Touch point: `src/commands/ui-harness.ts:61` (`startPreviewServer`) and its
  one caller, `runUISmokeTest()` in `src/commands/check.ts`.
- The screenshot script mentioned in ui-harness.ts's doc comment
  ("harness in ui-harness.ts with the screenshot script (#0213)") shares this
  same function — check whether it also wants isolation, or whether it
  legitimately needs the real board (e.g. to screenshot real tasks). If it
  needs the real board, split the two use cases instead of changing the
  shared default for both.
- Do NOT change the actual smoke assertions (title, mount check, nav,
  spacing guard) — only what root/board the server boots against.
- Do NOT touch the integration pipeline's own "check" invocation
  (`src/server/integration-orchestrator.ts`) beyond it inheriting this fix
  for free — no separate changes needed there.

## Original prompt

Follow-up from a conversation about why `repoos check` / the integration
pipeline's check phase is slow: the UI smoke test was found to boot against
the live repo board rather than an isolated fixture, causing it to inherit
unrelated job-recovery and preview-auto-launch overhead.

## Activity

- 2026-08-19T18:56:20Z · body

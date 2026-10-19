---
id: "0840"
title: "Diagnose 4 pre-existing full-suite test failures (activity-indicator-motion ×3, agent-contract ×1)"
type: bug
status: review
paths: [src/ui-app/tests/activity-indicator-motion.test.ts, src/ui-app/tests/agent-contract.test.ts]
priority: p3
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/diagnose-4-pre-existing-full-suite-test-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T22:39:47Z"
updated_at: "2026-10-19T03:00:05Z"
---
## Problem
`bun run test` (full suite) fails 4 tests on the work machine, reproducibly — twice in full-suite runs AND in isolation on an idle machine via `bun run test -- --failed-first <files>`:

- `src/ui-app/tests/activity-indicator-motion.test.ts`
- scales artwork, reserved width and the height envelope at every pixel size (#0816): bird-quick-trail size 20 scrollWidth 23 > 22
- leaves no animation running for any family under prefers-reduced-motion: markH expected > 0, got 0
- keeps every style static and visible under reduced motion at the largest size (#0816): bird-quick-trail static mark height expected > 0, got 0
- `src/ui-app/tests/agent-contract.test.ts`
- reports honest per-seam failures when the harness starts but streams garbage: `byId.get('cancellation')?.ok` expected false, got true (the seam reports exercised/passed instead of 'not exercised')

## Attribution (2026-10-19, #0834 engineer session)
Not caused by #0834 or its base branch #0664:

- Both test files and their subjects (`Indicator.vue`, `src/core/activity-animation.ts`, `src/core/agent-contract.ts`) are byte-identical to `main`.
- The only style.css delta on #0834's base is scoped `.ff-pending-file-*`/`.pm-shot-*` classes — no `.ai-*` selectors.
- Decisive repro: a scratch detached worktree at the merge-base `df6ccdead` with symlinked node_modules fails the **same 4 tests** identically.

## Notes
- First hypothesised flake — it is NOT: deterministic on this machine, 3/3 in isolation.
- The scoped handoff gate (`REPOOS_CHECK_CHANGED=…`, changed-path tests) does not select these files, so remote validation stays green; the full-suite gate before merge runs on the runner, where these apparently pass (recent close-outs were green).
- Suspect either a machine-environment difference (WebKit/fonts/timing on this Mac) or a landed regression nobody's full run has caught. Start by reproducing on `main` itself and diffing the runner environment.
Source: #0834 handoff session 2026-10-19.

## Desired UX
No UI change intended. A maintainer running bun run test on this machine gets a green suite, and CI/remote runs stay green. If the failures are real regressions (the bird-quick-trail artwork overflowing its width at size 20, reduced-motion marks collapsing to height 0, the agent-contract cancellation seam reporting ok instead of 'not exercised'), they are fixed in the product code; if they are environment-dependent, the tests are made robust without weakening what they check.

## Acceptance criteria
- Root cause identified for each of the 4 failures, written into this task: reproduce on main (not just the #0664 base), then compare this Mac with the runner environment (WebKit, fonts, timing).
- Each failure is either fixed in product code or its test is corrected with a reason; no test is simply skipped or loosened without an explanation.
- activity-indicator-motion.test.ts: bird-quick-trail at size 20 has scrollWidth <= its reserved width, and under prefers-reduced-motion the static mark has height > 0, at every pixel size (#0816).
- agent-contract.test.ts: a harness that starts but streams garbage reports the cancellation seam as not exercised, not ok.
- bun run test passes fully on this machine, and the runner's full-suite gate still passes.
- If the bird-quick-trail failures come from #0822's artwork or CSS, fix the artwork (the reserved width/height envelope), do not change the approved geometry.

## Notes for AI
Start from the Problem and Attribution sections above (the #0834 engineer already proved the failures are not caused by #0834/#0664 and reproduce at their merge-base). First reproduce on current main in a clean worktree. Files: src/ui-app/tests/activity-indicator-motion.test.ts, src/ui-app/tests/agent-contract.test.ts, src/ui-app/src/components/ActivityIndicator.vue, src/core/activity-animation.ts, src/core/agent-contract.ts, the bird-quick-trail CSS in style.css. Do not touch repoos.toml. Source: #0834 handoff session 2026-10-19.

## Activity

- 2026-10-18T22:39:47Z · created · njachowski@gmail.com
- 2026-10-18T22:39:49Z · needs_input
- 2026-10-19T02:46:20Z · body: Desired UX (added)
- 2026-10-19T02:46:23Z · body: Acceptance criteria (added)
- 2026-10-19T02:46:26Z · body: Notes for AI (added)
- 2026-10-19T02:46:34Z · needs_input
- 2026-10-19T02:46:39Z · status inbox→ready
- 2026-10-19T02:46:42Z · cli_override, model_override
- 2026-10-19T02:46:44Z · status ready→active, branch
- 2026-10-19T03:00:05Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-19T03:00:05Z · note: handoff requested (cli)

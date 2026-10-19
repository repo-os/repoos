---
id: "0840"
title: "Diagnose 4 pre-existing full-suite test failures (activity-indicator-motion ×3, agent-contract ×1)"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX, Acceptance criteria, Notes for AI"
paths: [src/ui-app/tests/activity-indicator-motion.test.ts, src/ui-app/tests/agent-contract.test.ts]
priority: p3
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T22:39:47Z"
updated_at: "2026-10-18T22:39:49Z"
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

## Activity

- 2026-10-18T22:39:47Z · created · njachowski@gmail.com
- 2026-10-18T22:39:49Z · needs_input

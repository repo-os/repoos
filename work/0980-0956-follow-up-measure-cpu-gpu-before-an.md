---
id: "0980"
title: "#0956 follow-up: measure CPU/GPU before and after, reduced-motion test, screenshots"
type: chore
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-29T14:44:34Z"
updated_at: "2026-10-29T14:44:45Z"
---
## Problem
#0956 (activity animations: pause when hidden, off screen, reduced motion, or over a concurrency cap) landed on 2026-10-29 without three of its acceptance criteria: a before/after CPU/GPU measurement, a reduced-motion test for every style, and screenshots of the Settings preview and a board with several working cards.

## Desired UX
Evidence that the change actually cut CPU/GPU use, and that every animation style still looks right.

## Acceptance criteria
- A before/after measurement recorded in `docs/` (and the task Resolution): renderer CPU and frame rate with 6 working task cards visible, on main before #0956 (`git checkout` the parent of the #0956 merge in a scratch worktree) and after. Use headless Chromium tracing or Playwright's CDP `Performance.getMetrics`; record the method.
- A test that every activity style renders its static frame (no running animation) under `prefers-reduced-motion: reduce`.
- Declared `## Shots`: the Settings activity preview, and a board with several working cards (use a state fixture), both captured at handoff.
- No behaviour changes beyond fixes the measurement turns up.

## Notes for AI
`src/ui-app/src/lib/activity-motion.ts`, `src/ui-app/src/components/ActivityIndicator.vue`, `src/ui-app/tests/activity-motion-coordinator.test.ts`. Do not edit repoos.toml. Never run `repoos serve`.

## Activity

- 2026-10-29T14:44:34Z · created · njachowski@gmail.com
- 2026-10-29T14:44:45Z · cli_override, model_override

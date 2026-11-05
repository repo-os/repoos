---
id: 1041
title: Update stale pressureGuard AGENTS.md assertions in default-agent-prompts.test.ts
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "empty sections: Problem, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p3
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-05T12:29:41Z"
updated_at: "2026-11-05T12:30:05Z"
---
## Problem
The gate is red on main: default-agent-prompts.test.ts > 'AGENTS.md makes pressureGuard the only resource start gate (#0940)' asserts five AGENTS.md patterns, but the 'shrink AGENTS.md to 26 KB' change removed that passage (now 1/5 match: only /pressureGuard/ hits; /vm.swapusage/, /memory_pressure -Q/, /Never...self-chosen numeric/, /do not invent another gate/ all miss). The rule itself survives in condensed form plus docs/memory-pressure-guard.md. This blocks every handoff whose gate runs the full suite (seen on #1038).

## Desired UX

_What should the end experience be?_

## Acceptance criteria
- [ai] Decide with the shrink owner: either restore a condensed pointer in AGENTS.md or update the test to assert the current wording plus the docs/memory-pressure-guard.md pointer. Keep the #0940 intent (pressureGuard is the only resource start gate). Full gate green.

## Notes for AI

_Constraints, files to touch, things NOT to do._

## Activity

- 2026-11-05T12:29:41Z · created · njachowski@gmail.com
- 2026-11-05T12:29:43Z · needs_input
- 2026-11-05T12:30:02Z · body: Problem (added 1, removed 1)
- 2026-11-05T12:30:05Z · body: Acceptance criteria (added 1, removed 1)

---
id: "1274"
title: "QA pass: Agents page model providers and routing status copy"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ""
created_by: t@t
branch: ""
created_at: "2026-11-20T07:26:57Z"
updated_at: "2026-11-20T07:26:57Z"
---
## Problem
Sweep the Agents settings tab (agent list, model providers, routing mode and status text) for layout, wording and state bugs, including the key-missing and paused states.

## Desired UX
Page looks and behaves correctly at 375, 768 and 1280 widths: no overflow, clear labels, plain-English status text, sensible empty and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- New browser tests are deterministic (explicit waits, fixed viewport) so they pass on slower remote runners.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never show real keys.

## Activity

- 2026-11-20T07:26:57Z · created · t@t

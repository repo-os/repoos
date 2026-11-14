---
id: "1115"
title: Build a mobile Settings composition
type: feature
status: inbox
priority: p1
area: web
depends_on: ["1112"]
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:10:57Z"
updated_at: "2026-11-14T13:19:03Z"
---
## Problem
Settings uses desktop navigation and dense grouped controls that become cramped on narrow screens.

## Desired UX
Settings below the mobile breakpoint has a single-column, touch-friendly layout while preserving all existing configuration behavior.

## Acceptance criteria
- Provide narrow-screen Settings navigation and content in a dedicated mobile composition; preserve existing fields and save semantics.
- Organize sections into a readable single column with labels and controls that wrap without horizontal page overflow.
- Controls are comfortably touch-sized, keyboard accessible and do not rely on hover.
- Reuse existing config schema, settings stores and save/error behavior; add no raw-TOML-only user setting.
- Preserve desktop Settings at/above the breakpoint.
- Add coverage for narrow layout, navigation, save/error behavior and unchanged desktop behavior.
## Notes for AI
Read ADR 0011 and reuse existing Settings tabs, config schema and shared dialog/form conventions. Keep this scoped to Settings; shell navigation is delivered by #1112.

## Activity

- 2026-11-14T09:10:57Z · created · t@t
- 2026-11-14T09:10:58Z · needs_input
- 2026-11-14T09:11:44Z · depends_on, body: Desired UX (added); Acceptance criteria (added 3, removed 3); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:22:38Z · needs_input
- 2026-11-14T13:19:03Z · cli_override, model_override

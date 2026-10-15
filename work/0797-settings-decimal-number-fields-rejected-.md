---
id: "0797"
title: "Settings: decimal number fields rejected on save (slow-check multiplier)"
type: bug
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-15T09:56:55Z"
updated_at: "2026-10-15T09:56:55Z"
---
## Problem
Changing any setting (for example the activity animation) shows the red error 'Flag slow checks above (× median) must be a whole number', although that field was not touched.

Cause: attention.slowRunMultiplier (src/core/config.ts ~2284) is a decimal by design, with default 1.5, and the current value is 1.5. The server's number validator (src/server/routes/config.ts ~563-566) accepts only whole non-negative numbers, so the value is rejected. The Settings page sends every number field on save, so this unrelated field fails any save.

Two things are wrong:
1. The validator is wrong for decimal settings. Some number fields need decimals.
2. The Settings page sends unchanged fields on save. Only changed values should be sent, so an unchanged field can't block a save.

## Desired UX
- Saving any setting shows no error for fields the user didn't change.
- The slow-check multiplier accepts decimals (for example 1.5, 2.25) and rejects zero or negative values.
- Whole-number fields still reject decimals.

## Acceptance criteria
- Test: attention.slowRunMultiplier accepts 1.5 and 2.25, rejects 0 and -1.
- Test: a Settings save that changes only the animation setting sends no other number fields and succeeds.
- Test: whole-number fields still reject 1.5.
- The schema records min and step per number field, so the validator uses it (AGENTS.md: keep Settings and schema in step).

## Notes for AI
Start from the number branch in src/server/routes/config.ts (~560-570) and the Settings save path in src/ui-app/src/views/SettingsView.vue. Source: user report 2026-10-15.

## Activity

- 2026-10-15T09:56:55Z · created · njachowski@gmail.com

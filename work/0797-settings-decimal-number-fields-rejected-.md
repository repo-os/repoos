---
id: "0797"
title: "Settings: decimal number fields rejected on save (slow-check multiplier)"
type: bug
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/settings-decimal-number-fields-rejected-
cli_override: claude code
model_override: haiku
created_at: "2026-10-15T09:56:55Z"
updated_at: "2026-10-15T11:50:23Z"
review_rounds: 2
review_passes: 2
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
- 2026-10-15T09:57:58Z · cli_override, model_override
- 2026-10-15T09:58:06Z · status inbox→ready
- 2026-10-15T09:58:07Z · status ready→active, branch
- 2026-10-15T10:13:02Z · body
- 2026-10-15T10:26:37Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > SettingsView board column labels (#0499) > auto-save omits hidden dev.inspector settings unless the build supports them (#0509), tests/remote-host-config.test.ts > remoteValidation.hangIdleMinutes (#0729) > ignores a non-positive or non-numeric value, keeping the default on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T10:32:14Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/board-column-labels.test.ts > SettingsView board column labels (#0499) > auto-save omits hidden dev.inspector settings unless the build supports them (#0509), tests/remote-host-config.test.ts > remoteValidation.hangIdleMinutes (#0729) > ignores a non-positive or non-numeric value, keeping the default on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T10:40:13Z · body
- 2026-10-15T10:42:52Z · body
- 2026-10-15T10:51:30Z · status active→review
- 2026-10-15T10:52:40Z · note: review pass 1: needs some work
- 2026-10-15T10:52:40Z · status review→active
- 2026-10-15T10:54:59Z · body
- 2026-10-15T11:05:41Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > SettingsView board column labels (#0499) > auto-save omits hidden dev.inspector settings unless the build supports them (#0509) on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T11:25:52Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/board-column-labels.test.ts > SettingsView board column labels (#0499) > auto-save omits hidden dev.inspector settings unless the build supports them (#0509), tests/remote-host-config.test.ts > remoteValidation.hangIdleMinutes (#0729) > ignores a non-positive or non-numeric value, keeping the default on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T11:33:03Z · message_queued at 2026-10-15T11:33:03.406Z
- 2026-10-15T11:33:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T11:39:57Z · body
- 2026-10-15T11:46:38Z · body
- 2026-10-15T11:48:09Z · body
- 2026-10-15T11:48:56Z · status active→review
- 2026-10-15T11:50:23Z · note: review pass 2: needs some work
- 2026-10-15T11:50:23Z · message_queued at 2026-10-15T11:50:23.406Z
- 2026-10-15T11:50:23Z · status review→active

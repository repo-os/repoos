---
id: "0797"
title: "Settings: decimal number fields rejected on save (slow-check multiplier)"
type: bug
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: "`needs some work` — Server validator, schema `min`/`step`, and Settings “save only changed keys” match the spec and new tests; handoff UI evidence is **STALE** (tree `f313bbb6c` vs reviewed `fc0418663`) and the only PNG is an auto capture of `/` (board), not the declared `/settings?tab=general` shot. Re-capture on final HEAD before sign-off."
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/settings-decimal-number-fields-rejected-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-15T09:56:55Z"
updated_at: "2026-10-15T17:31:01Z"
review_passes: 4
review_rounds: 2
dev_error_count: 1
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

## Shots
```json
[
{
"label": "Settings general tab after decimal save fix",
"target": "default",
"route": "/settings?tab=general",
"highlight": "#setting-activityAnimationStyle"
}
]
```

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
- 2026-10-15T12:12:04Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/board-column-labels.test.ts > SettingsView board column labels (#0499) > auto-save omits hidden dev.inspector settings unless the build supports them (#0509), tests/remote-host-config.test.ts > remoteValidation.hangIdleMinutes (#0729) > ignores a non-positive or non-numeric value, keeping the default on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T12:36:11Z · agent exited with an error (claude) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/board-column-labels.test.ts > SettingsView board column labels (#0499) > auto-save omits hidden dev.inspector settings unless the build supports them (#0509) on bee — fix it in the feature branch and re-run the gate. The same worktree can be resumed and retried.
- 2026-10-15T12:36:11Z · status active→review
- 2026-10-15T12:36:11Z · note: handoff requested (cli)
- 2026-10-15T12:48:36Z · handoff failed · task-file handoff failed at check · repoos check failed: ◆ Check plan
- 2026-10-15T15:23:19Z · needs_input
- 2026-10-15T16:47:28Z · body
- 2026-10-15T16:48:17Z · status active→review
- 2026-10-15T16:48:18Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-15T16:49:16Z · note: review pass 3: needs some work
- 2026-10-15T16:49:17Z · needs_input
- 2026-10-15T17:01:49Z · status review→active
- 2026-10-15T17:01:51Z · cli_override, model_override
- 2026-10-15T17:01:56Z · needs_input
- 2026-10-15T17:02:23Z · message_queued at 2026-10-15T17:02:23.614Z
- 2026-10-15T17:04:29Z · body: section Shots
- 2026-10-15T17:05:09Z · body
- 2026-10-15T17:06:19Z · body
- 2026-10-15T17:06:57Z · status active→review
- 2026-10-15T17:08:00Z · note: review pass 4: needs some work
- 2026-10-15T17:08:01Z · needs_input
- 2026-10-15T17:13:16Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > SettingsView board column labels (#0499) > auto-save omits hidden dev.inspector settings unless the build supports them (#0509) on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T17:17:41Z · status review→active
- 2026-10-15T17:17:41Z · note: `needs some work` — Server validator, schema `min`/`step`, and Settings “save only changed keys” match the spec and new tests; handoff UI evidence is **STALE** (tree `f313bbb6c` vs reviewed `fc0418663`) and the only PNG is an auto capture of `/` (board), not the declared `/settings?tab=general` shot. Re-capture on final HEAD before sign-off.
- 2026-10-15T17:18:58Z · body
- 2026-10-15T17:20:32Z · body: section Shots
- 2026-10-15T17:22:01Z · body
- 2026-10-15T17:23:41Z · body
- 2026-10-15T17:30:01Z · status active→review
- 2026-10-15T17:31:01Z · note: review pass 5: good to go

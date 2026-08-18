---
id: "0236"
title: "Reorganize Settings: promote voice transcription, simplify Advanced"
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/reorganize-settings-promote-voice-transc
model_override: default
created_at: "2026-08-16T14:58:04Z"
updated_at: "2026-08-18T03:00:46Z"
review_rounds: 1
---
## Context

Voice transcription (Whisper / vibe coding) is a user-facing feature that requires a provider and API key, but its settings are currently hidden under Advanced. This makes the feature difficult to discover and configure.

## Scope

- Move **Voice transcription provider** and **Voice transcription API key** out of Settings → Advanced into a clearly labeled primary Settings section (for example, “Voice transcription”).
- Preserve the existing provider choices (Disabled, Groq, OpenAI), autosave behavior, secret redaction, and environment-variable fallback.
- Audit the remaining Settings controls and keep only infrequently changed, operationally risky, or developer-facing controls in Advanced.
- Keep everyday controls easy to discover and use. Do not move commonly used configuration behind the Advanced disclosure without a clear reason.
- Ensure the grouping works in both themes and at narrow widths.

## Acceptance criteria

1. A new user can find and configure voice transcription from the main Settings view without opening Advanced.
2. The API key remains redacted from browser reads and is never displayed after save.
3. Advanced contains only appropriate low-frequency/risky settings, with a coherent grouping and clear descriptions.
4. Existing Settings autosave behavior remains intact.
5. `repoos check` passes with zero console errors.

## Files

- src/ui-app/src/views/SettingsView.vue
- src/ui-app/src/stores/config.ts
- src/core/config.ts
- src/ui-app/tests/whisper-config.test.ts (and focused UI tests as needed)

## Activity

- 2026-08-16T14:58:04Z · created · unknown
- 2026-08-16T15:01:52Z · status ready→active, branch
- 2026-08-16T18:56:49Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-16T18:56:49Z · status review→active
- 2026-08-16T19:52:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-17T03:27:29Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-17T04:51:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-17T04:51:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-17T06:02:46Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-17T08:26:23Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-18T02:27:04Z · status active→review
- 2026-08-18T03:00:46Z · model_override

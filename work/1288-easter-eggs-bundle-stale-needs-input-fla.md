---
id: "1288"
title: "Easter eggs bundle: stale needs-input flag, hand-off failure reason, attention noise"
type: chore
status: review
priority: p3
area: [core, server]
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-stale-needs-input-fla
cli_override: claude code
model_override: haiku
created_at: "2026-11-25T08:29:47Z"
updated_at: "2026-11-25T09:45:14Z"
last_check_failure: "repoos check at 2026-11-25T09:17:10.744Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
---
## Problem
Three small defects seen while driving the board (2026-11-22/23).

## Desired UX
1. A task whose later review passes no longer keeps a stale needs_input flag with reason provider-failure (seen on #1265).
2. repoos handoff-status shows the actual failing step output for a failed check, not just the heading 'repoos check failed: ◆ Check plan'.
3. repoos attention is not flooded by dozens of 'Could not signal process group' entries (collapse or drop harmless ones).
No new UI.

## Acceptance criteria
- Each item is reproduced first, fixed, and covered by a test. If an item no longer reproduces, say so in the report and skip it.

## Notes for AI
See docs/easter-eggs-bundles.md. Do not change repoos.toml.

## Activity

- 2026-11-25T08:29:47Z · created · t@t
- 2026-11-25T08:29:53Z · cli_override, model_override
- 2026-11-25T08:29:56Z · status inbox→ready
- 2026-11-25T08:29:57Z · status ready→active, branch
- 2026-11-25T08:50:37Z · CTO nudge: held — handoff gate is running
- 2026-11-25T09:17:07Z · message_queued at 2026-11-25T09:17:07.563Z
- 2026-11-25T09:17:10Z · message_delivered: 1 message(s)
- 2026-11-25T09:20:38Z · CTO nudge: held — remote validation is running
- 2026-11-25T09:28:56Z · body
- 2026-11-25T09:28:56Z · body
- 2026-11-25T09:30:38Z · CTO nudge: held — handoff gate is running
- 2026-11-25T09:45:14Z · status active→review
- 2026-11-25T09:45:14Z · message_queued at 2026-11-25T09:45:14.414Z
- 2026-11-25T09:45:14Z · note: shots: skipped — the diff (8 changed paths) touches no capture target's globs — no UI change to capture

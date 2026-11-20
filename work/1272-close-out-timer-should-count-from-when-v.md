---
id: "1272"
title: Close-out timer should count from when validation actually starts
type: feature
status: done
priority: p2
area: web
merged_commit: b470a939f4f31eef5b0e0b5d669537713f4abf84
assigned_to: ai
created_by: t@t
branch: feat/close-out-timer-should-count-from-when-v
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T06:08:31Z"
updated_at: "2026-11-20T12:55:18Z"
last_close_out_gate_ms: 562167
last_close_out_gate_at: "2026-11-20T12:52:32.222Z"
review_passes: 1
---
## Problem
After Move to done on a green review task, the card shows a Checks timer (e.g. 20m 29s) that appears to have started long before the close-out began. It looks like the clock counts from when the task was clicked or queued (or from an earlier attempt), not from when validation actually started. Seen with a queue of close-outs (see screenshot): the running task shows a large elapsed time, and the queued one shows no clear state.

## Desired UX
- The timer on a card counts only from the moment its validation starts running (the job's startedAt), not from when it was queued or when Move to done was clicked.
- While queued, show the queue position and no running timer (optionally a separate waited-in-queue note).
- A retried attempt restarts the timer from its own start.

## Acceptance criteria
- TaskCard close-out timer (see closeOutAttemptStartedAt in src/ui-app/src/components/TaskCard.vue) and IntegrationStatusBar use the validating phase start, never enqueuedAt or the first attempt.
- Queued jobs show queue position without an elapsed timer.
- Test covering queued, validating and retried states.

## Notes for AI
Never touch repoos.toml. Headless Playwright only.

## Screenshots

![Review cards after Move to done: #0047 shows Checks timer 20m 29s though it only just started; #0046 is queued](/api/tasks/1272/attachments/att_45d7cf8f-52ef-4bea-b065-a2b0ed0979ad.png)

## Activity

- 2026-11-20T06:08:31Z · created · t@t
- 2026-11-20T06:08:32Z · screenshots
- 2026-11-20T06:08:38Z · status inbox→ready
- 2026-11-20T06:26:58Z · cli_override, model_override
- 2026-11-20T06:26:59Z · status ready→active, branch
- 2026-11-20T07:30:43Z · body
- 2026-11-20T07:40:39Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T07:40:40Z · status active→review
- 2026-11-20T07:40:40Z · message_queued at 2026-11-20T07:40:40.353Z
- 2026-11-20T07:42:23Z · note: review pass 1: good to go
- 2026-11-20T08:54:36Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T12:52:32Z · close-out gate completed in 562s
- 2026-11-20T12:52:46Z · message_dropped: 1 queued message(s) discarded — task is done
- 2026-11-20T12:55:18Z · status done→done, release:success

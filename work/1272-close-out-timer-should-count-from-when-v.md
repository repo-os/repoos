---
id: "1272"
title: Close-out timer should count from when validation actually starts
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T06:08:31Z"
updated_at: "2026-11-20T06:26:58Z"
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

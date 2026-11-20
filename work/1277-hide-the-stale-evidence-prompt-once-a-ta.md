---
id: "1277"
title: Hide the stale-evidence prompt once a task is queued or moving to done
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-20T08:26:19Z"
updated_at: "2026-11-20T08:26:22Z"
---
## Problem
A review card that is already queued for close-out (Moving to done, queued #N) still shows 'Stale evidence is the only finding · repoos verify <id>' and a Refresh evidence button. Once close-out is queued or running the evidence prompt is noise, and clicking it would start a new review on a task that is mid-close-out.

## Desired UX
While a task has an active or queued close-out job, the card and drawer hide the stale-evidence notice and Refresh evidence button (and the CLI refuses repoos verify with a clear message, as it already does while a close-out is active). They come back if the close-out fails and the task returns to review.

## Acceptance criteria
- TaskCard.vue (stale evidence block near line 2049) and TaskDrawer.vue (Refresh evidence near line 7414) are hidden whenever the integration job phase is queued, syncing, validating, publishing or cleanup.
- Shown again after a failed job.
- Test covering queued, validating and failed states.

## Notes for AI
Never touch repoos.toml. Headless Playwright only.

## Screenshots

![#1269 is queued for close-out but still shows Stale evidence is the only finding and a Refresh evidence button](/api/tasks/1277/attachments/att_bc4dc94a-abc2-4b59-889e-3791e4512fd9.png)

## Activity

- 2026-11-20T08:26:19Z · created · t@t
- 2026-11-20T08:26:22Z · screenshots

---
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-22T11:53:55.847Z: repoos check failed: ui verification failed (2 issue(s)): [route] auto: matched src/ui-app/** · phone 390x844: declared route / but the browser landed on /work (login or redirect?) (captured http://127.0.0.1:38563/work) (http://127.0.0.1:38563/work); [route] auto: matched src/ui-app/** · desktop 1280x800: declared route / but the browser landed on /work (login or redirect?) (captured http://127.0.0.1:38563/work) (http://127.0.0.1:38563/work)"
id: "1277"
title: Hide the stale-evidence prompt once a task is queued or moving to done
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: feat/hide-the-stale-evidence-prompt-once-a-ta
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T08:26:19Z"
updated_at: "2026-11-22T11:53:55Z"
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
Also (Nick): on the card and drawer, show only the Refresh evidence button; do not show the repoos verify <id> command text. Shorten the notice text to just: Stale evidence. Update any tests that assert the old wording. Never touch repoos.toml. Headless Playwright only.

## Screenshots

![#1269 is queued for close-out but still shows Stale evidence is the only finding and a Refresh evidence button](/api/tasks/1277/attachments/att_bc4dc94a-abc2-4b59-889e-3791e4512fd9.png)

## Activity

- 2026-11-20T08:26:19Z · created · t@t
- 2026-11-20T08:26:22Z · screenshots
- 2026-11-20T08:26:34Z · status inbox→ready
- 2026-11-20T08:27:03Z · body: Notes for AI (added 1, removed 1)
- 2026-11-22T11:37:08Z · cli_override, model_override
- 2026-11-22T11:37:09Z · status ready→active, branch
- 2026-11-22T11:47:11Z · body
- 2026-11-22T11:51:56Z · CTO nudge: held — handoff gate is running
- 2026-11-22T11:53:52Z · note: ui verification failed: ui verification failed (2 issue(s)): [route] auto: matched src/ui-app/** · phone 390x844: declared route / but the browser landed on /work (login or redirect?) (captured http://127.0.0.1:38563/work) (http://127.0.0.1:38563/work); [route] auto: matched src/ui-app/** · desktop 1280x800: declared route / but the browser landed on /work (login or redirect?) (captured http://127.0.0.1:38563/work) (http://127.0.0.1:38563/work)
- 2026-11-22T11:53:52Z · message_queued at 2026-11-22T11:53:52.697Z
- 2026-11-22T11:53:55Z · message_delivered: 1 message(s)


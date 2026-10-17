---
id: "0819"
title: "Easter eggs bundle: shot warnings, viewer status, and bird tracks"
type: bug
status: review
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-shot-warnings-viewer-
created_at: "2026-10-17T12:52:42Z"
updated_at: "2026-10-17T18:15:50Z"
---
## Problem
Four small items, one open easter-eggs bundle:
1. When a change touches documentation, the handoff capture tries the Docs site preview target. If no declared shot names a docs route, the target is skipped, and the Changes tab shows '[shot-warning] declared shot not captured — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped'. The wording is hard to act on. The screenshot viewer also shows only the image, not the green check or the warning.
2. Test coverage for #0817's Update requirements flow is missing for two entry points: saving through the spec form, and editing the task file by hand (the file watcher path). Both must send the engineer the requirements notice.
3. Settings saves auto-commit repoos.toml to main (src/server/routes/config.ts, commitConfigWrite). Each slider step commits to main, and each commit makes an in-flight close-out restart. Remove the auto-commit: a save writes repoos.toml to disk only, and the Move to done dirty-main prompt covers it. Background: #0682 added the auto-commit so a settings save would not block Move to done silently.
4. The integration timer tooltip reads 'Median of the last 3 integration runs' when 15 runs exist. The median reads an in-memory list (src/ui-app/src/stores/notices.ts, closeOutOutcomes, CLOSE_OUT_TIMING_LIMIT) that is only filled from live events since the page opened, so a reload starts with a few runs. Load the recent close-out outcomes from the server on startup (the server keeps them on disk, see createCloseOutOutcomeStore), so the median uses up to 15 runs or however many exist. The tooltip is also too narrow: make it wider and lay it out as exactly two lines. Line 1: the median as a chip styled like the timer chip (for example 'Median 2m 25s'). Line 2: the instruction 'Click to switch between elapsed time and a countdown', in a fainter, smaller, italic style.

## Desired UX
- Item 1: the skipped docs warning reads 'Docs site skipped: no docs shot declared', with a short link that explains how to declare a docs route for the task. The screenshot viewer header shows the shot's check (or cross) and any warning for that shot.
- Item 2: no change in behaviour; new tests lock in the existing behaviour for the two paths.
- Item 3: a Settings save changes repoos.toml on disk only, with no commit to main. A repoos.toml change left uncommitted shows in the Move to done dirty-main prompt.
- Item 4: the timer tooltip shows the median of up to the last 15 SUCCEEDED close-outs with timing data, loaded from the server, so a fresh page shows the same count as a long-open one. Failed and timed-out runs are not counted. The tooltip is wider, with two lines: the median as a chip on line 1, and the click instruction on line 2 in a fainter, italic style.

## Acceptance criteria
- Test: a docs-only change with no declared docs shot shows the new warning text and the declare link.
- Test: the screenshot viewer shows the shot's check and warning in its header.
- Test: saving the body through the spec form on an active task sends the engineer one requirements notice with the changed sections.
- Test: editing the task file by hand on an active task sends the engineer the same notice.
- Test: a settings save writes repoos.toml and makes no commit (main's log unchanged).
- Test: Move to done with an uncommitted repoos.toml shows the dirty-main prompt rather than silently committing.
- Test: on a fresh page load with 15 stored close-out outcomes, the timer tooltip reports a median of 15 runs.
- Light and dark themes checked on the warning, the viewer header and the tooltip.

## Notes for AI
Start from the shot-warning text in the handoff capture code (grep for 'docs captures need a declared route') and the screenshot viewer (grep for 'Wider images scale down'). For item 2, see src/server/requirements-notice.ts and src/server/live-index.ts. For item 3, see commitConfigWrite in src/server/routes/config.ts and the dirty-main guard in src/server/routes/tasks.ts. For item 4, see src/ui-app/src/stores/notices.ts, src/ui-app/src/lib/integration-pipeline-ui.ts (integrationDurationSamples, integrationMedianTip, INTEGRATION_MEDIAN_SAMPLE = 15) and src/ui-app/src/components/IntegrationStatusBar.vue. For item 4 the median counts only close-outs with outcome 'succeeded' (CloseOutOutcome in src/ui-app/src/types.ts). Failed and timed-out runs are excluded, so the median reflects a normal run. Keep the #0682 intent in item 3. Source: user reports 2026-10-17.

## Screenshots

![Approved bird-track shape reference: tapered central toe, splayed side toes, and short heel](/api/tasks/0819/attachments/screenshot-1.png)

## Activity

- 2026-10-17T12:52:42Z · created · njachowski@gmail.com
- 2026-10-17T12:52:46Z · status inbox→ready
- 2026-10-17T13:17:57Z · title, body: section Bird quick trail animation (third bundle item)
- 2026-10-17T13:17:57Z · screenshots
- 2026-10-17T14:04:33Z · body
- 2026-10-17T15:06:34Z · body: Problem (added 2, removed 1); Desired UX (added 1); Acceptance criteria (added 2); Notes for AI (added 1, removed 1)
- 2026-10-17T15:32:36Z · body: Problem (added 5, removed 4); Desired UX (added 3, removed 2); Acceptance criteria (added 5, removed 4); Notes for AI (added 1, removed 1)
- 2026-10-17T15:33:36Z · body: Notes for AI (added 1, removed 1)
- 2026-10-17T15:33:38Z · body: Desired UX (added 1, removed 1)
- 2026-10-17T15:33:55Z · status ready→active, branch
- 2026-10-17T16:09:49Z · status active→review
- 2026-10-17T17:39:03Z · status review→active
- 2026-10-17T18:14:40Z · status active→review
- 2026-10-17T18:15:50Z · note: review pass 1: good to go

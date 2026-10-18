---
updated_at: "2026-10-18T02:27:21Z"
review_passes: 11
id: "0819"
title: "Easter eggs bundle: shot warnings, viewer status, and timer tooltip"
type: bug
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: "`needs some work` — The bundle delivers all five items with solid unit/integration tests and green handoff captures for docs skip (light/dark), screenshot viewer header (light/dark), and model-routing copy (light/dark). Integration timer tooltip shots (default-5/6) failed every step: they used `closeOut:active`, which does not expand the bar or seed 15 outcomes; the branch adds `integration:median15` for exactly that, but declared shots were not updated, so light/dark tooltip styling is unverified despite passing `notices.test.ts` / component tests."
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-shot-warnings-viewer-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-17T12:52:42Z"
last_check_failure: "repoos check at 2026-10-18T01:43:13.722Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from d6b69a01 to 346573ab) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
review_rounds: 2
routing_switches: 1
routing_escalations: 1
---
## Problem
Four small items, one open easter-eggs bundle:
1. When a change touches documentation, the handoff capture tries the Docs site preview target. If no declared shot names a docs route, the target is skipped. The warning text is hard to act on, and the screenshot viewer shows only the image, not the check or the warning.
2. Test coverage for #0817's Update requirements flow is missing for two entry points: saving through the spec form, and editing the task file by hand.
3. Settings saves auto-commit repoos.toml to main, so each slider step commits to main and restarts an in-flight close-out.
4. The integration timer tooltip median counts too few runs after a reload, is too narrow, and counts failed runs.
5. The Model routing checkbox 'Ask the decision model whether the task needs a human-only step' hides that the check is for mixed AI and human steps, and that a yes means the task should be split. The copy should say so.

## Desired UX
- Item 1: the skipped docs warning reads 'Docs site skipped: no docs shot declared', with a link explaining how to declare a docs route. The screenshot viewer header shows the shot's check (or cross) and any warning.
- Item 2: tests lock in the existing notice behaviour for the spec form and a hand edit.
- Item 3: a Settings save changes repoos.toml on disk only, with no commit to main. An uncommitted repoos.toml shows in the Move to done dirty-main prompt.
- Item 4: the timer median uses up to the last 15 succeeded close-outs, loaded from the server, so a fresh page matches a long-open one. The tooltip is wider, with the median chip on line 1 and the click instruction on line 2 in a fainter, italic style.
- Item 5: the Model routing checkbox reads 'Check for mixed AI and human steps, and suggest splitting the task'. Its help text says a yes means the task should be split into a separate AI task and a human task, and that the keyword check runs if the model is unavailable. Change only the label and help text; the question sent to the model is unchanged.

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

## Shots
```json
[
{
"label": "Docs skip warning and declare link (light)",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".ui-changes .shot-problem",
"steps": [
{
"waitFor": ".ui-changes .shot-problem"
}
],
"state": "drawer:shotEvidence",
"theme": "light"
},
{
"label": "Docs skip warning and declare link (dark)",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".ui-changes .shot-problem",
"steps": [
{
"waitFor": ".ui-changes .shot-problem"
}
],
"state": "drawer:shotEvidence",
"theme": "dark"
},
{
"label": "Screenshot viewer header with verdict and warning (light)",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".shot-viewer-shot-head",
"steps": [
{
"waitFor": ".ui-changes .shot-row:first-of-type img"
},
{
"click": ".ui-changes .shot-row:first-of-type img"
},
{
"waitFor": ".shot-viewer-shot-head"
}
],
"state": "drawer:shotEvidence",
"theme": "light"
},
{
"label": "Screenshot viewer header with verdict and warning (dark)",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".shot-viewer-shot-head",
"steps": [
{
"waitFor": ".ui-changes .shot-row:first-of-type img"
},
{
"click": ".ui-changes .shot-row:first-of-type img"
},
{
"waitFor": ".shot-viewer-shot-head"
}
],
"state": "drawer:shotEvidence",
"theme": "dark"
},
{
"label": "Integration timer median tooltip (light)",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"integration-timer-tip\"]",
"steps": [
{
"waitFor": "[data-test-id=\"integration-timer\"]"
},
{
"click": "[data-test-id=\"integration-timer\"]"
},
{
"waitFor": "[data-test-id=\"integration-timer-tip\"]"
}
],
"state": "closeOut:active",
"theme": "light"
},
{
"label": "Integration timer median tooltip (dark)",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"integration-timer-tip\"]",
"steps": [
{
"waitFor": "[data-test-id=\"integration-timer\"]"
},
{
"click": "[data-test-id=\"integration-timer\"]"
},
{
"waitFor": "[data-test-id=\"integration-timer-tip\"]"
}
],
"state": "closeOut:active",
"theme": "dark"
},
{
"label": "Mixed AI and human step check copy (light)",
"target": "default",
"route": "/agents?tab=model-routing",
"highlight": "[data-test-id=\"routing-human-step-row\"]",
"steps": [
{
"waitFor": "[data-testid=\"model-routing-panel\"]"
},
{
"waitFor": "[data-test-id=\"routing-human-step-row\"]"
}
],
"theme": "light"
},
{
"label": "Mixed AI and human step check copy (dark)",
"target": "default",
"route": "/agents?tab=model-routing",
"highlight": "[data-test-id=\"routing-human-step-row\"]",
"steps": [
{
"waitFor": "[data-testid=\"model-routing-panel\"]"
},
{
"waitFor": "[data-test-id=\"routing-human-step-row\"]"
}
],
"theme": "dark"
}
]
```

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
- 2026-10-17T15:47:04Z · body
- 2026-10-17T15:56:33Z · body
- 2026-10-17T15:57:56Z · body
- 2026-10-17T15:59:20Z · body
- 2026-10-17T16:00:55Z · body
- 2026-10-17T16:02:34Z · body
- 2026-10-17T16:09:50Z · status active→review
- 2026-10-17T16:09:59Z · note: highlight [data-test-id="integration-timer"] matched nothing on /
- 2026-10-17T16:10:58Z · note: review pass 1: needs some work
- 2026-10-17T16:10:59Z · status review→active
- 2026-10-17T16:12:02Z · body
- 2026-10-17T16:13:20Z · body
- 2026-10-17T16:20:31Z · status active→review
- 2026-10-17T16:20:32Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (9832a9b89) during finalization (#0734)
- 2026-10-17T16:20:32Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (9832a9b89) during finalization (#0734)
- 2026-10-17T16:21:37Z · note: review pass 2: needs some work
- 2026-10-17T16:21:39Z · status review→active
- 2026-10-17T16:22:37Z · body
- 2026-10-17T16:22:49Z · title
- 2026-10-17T16:23:59Z · status active→review
- 2026-10-17T16:24:00Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (9832a9b89) during finalization (#0734)
- 2026-10-17T16:24:00Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (9832a9b89) during finalization (#0734)
- 2026-10-17T16:25:05Z · note: review pass 3: good to go
- 2026-10-17T16:47:27Z · status review→active
- 2026-10-17T16:51:04Z · body
- 2026-10-17T16:51:49Z · body
- 2026-10-17T16:52:23Z · body: Problem (added 5, removed 4)
- 2026-10-17T16:52:23Z · message_queued at 2026-10-17T16:52:23.497Z
- 2026-10-17T16:52:25Z · body: Desired UX (added 5, removed 4)
- 2026-10-17T16:52:25Z · message_queued at 2026-10-17T16:52:25.830Z
- 2026-10-17T16:52:29Z · message_queued at 2026-10-17T16:52:29.859Z
- 2026-10-17T16:53:13Z · body
- 2026-10-17T16:53:57Z · status active→review
- 2026-10-17T16:55:16Z · note: review pass 4: needs some work
- 2026-10-17T16:56:11Z · status review→active
- 2026-10-17T16:56:22Z · message_queued at 2026-10-17T16:56:22.872Z
- 2026-10-17T17:00:29Z · status active→review
- 2026-10-17T17:00:29Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cb1944731) during finalization (#0734)
- 2026-10-17T17:00:30Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cb1944731) during finalization (#0734)
- 2026-10-17T17:01:41Z · note: review pass 5: needs some work
- 2026-10-17T17:01:41Z · needs_input
- 2026-10-17T17:39:03Z · status review→active
- 2026-10-17T17:39:06Z · message_delivered: 4 message(s)
- 2026-10-17T17:47:55Z · body
- 2026-10-17T17:49:10Z · body
- 2026-10-17T17:50:36Z · body
- 2026-10-17T18:01:13Z · note: ui verification failed (32 issue(s)): [request] HTTP 404 for http://127.0.0.1:53612/api/tasks/9999/diff-stats (http://127.0.0.1:53612/api/tasks/9999/diff-stats); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:53612/api/tasks/9999/diff-stats); [request] HTTP 404 for http://127.0.0.1:53612/api/tasks/9999/diff (http://127.0.0.1:53612/api/tasks/9999/diff); [request] Failed to load resource: the server responded with a status of 404 (Not Fou
- 2026-10-17T18:04:34Z · body
- 2026-10-17T18:05:45Z · body
- 2026-10-17T18:14:40Z · status active→review
- 2026-10-17T18:15:02Z · note: click .shot-row img: click: Error: strict mode violation: locator('.shot-row img') resolved to 2 elements: on /work?task=9999&tab=changes
- 2026-10-17T18:15:03Z · note: waitFor .shot-viewer-shot-head: waitFor: Timeout 5000ms exceeded. on /work?task=9999&tab=changes
- 2026-10-17T18:15:03Z · note: highlight .shot-viewer-shot-head matched nothing on /work?task=9999&tab=changes
- 2026-10-17T18:15:23Z · note: click .shot-row img: click: Error: strict mode violation: locator('.shot-row img') resolved to 2 elements: on /work?task=9999&tab=changes
- 2026-10-17T18:15:23Z · note: waitFor .shot-viewer-shot-head: waitFor: Timeout 5000ms exceeded. on /work?task=9999&tab=changes
- 2026-10-17T18:15:23Z · note: highlight .shot-viewer-shot-head matched nothing on /work?task=9999&tab=changes
- 2026-10-17T18:15:46Z · note: review pass 6: needs some work
- 2026-10-17T18:15:46Z · needs_input
- 2026-10-17T18:15:46Z · needs_input
- 2026-10-18T01:19:07Z · status review→active
- 2026-10-18T01:19:09Z · cli_override, model_override
- 2026-10-18T01:19:13Z · needs_input
- 2026-10-18T01:19:56Z · message_queued at 2026-10-18T01:19:56.020Z
- 2026-10-18T01:20:18Z · body
- 2026-10-18T01:21:28Z · body
- 2026-10-18T01:21:39Z · status active→review
- 2026-10-18T01:22:08Z · note: click .ui-changes .shot-row button.shot-expand: click: Error: strict mode violation: locator('.ui-changes .shot-row button.shot-expand') resolved to 2 elements: on /work?task=9999&tab=changes
- 2026-10-18T01:22:08Z · note: highlight .shot-viewer-shot-head matched nothing on /work?task=9999&tab=changes
- 2026-10-18T01:22:44Z · note: review pass 7: needs some work
- 2026-10-18T01:22:44Z · needs_input
- 2026-10-18T01:33:37Z · status review→active
- 2026-10-18T01:33:45Z · needs_input
- 2026-10-18T01:33:45Z · message_delivered: 1 message(s)
- 2026-10-18T01:35:34Z · body
- 2026-10-18T01:36:25Z · body
- 2026-10-18T01:36:58Z · status active→review
- 2026-10-18T01:38:17Z · note: waitFor [data-test-id="integration-timer"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T01:38:17Z · note: click [data-test-id="integration-timer"]: click: Timeout 5000ms exceeded. on /
- 2026-10-18T01:38:18Z · note: waitFor [data-test-id="integration-timer-tip"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T01:38:18Z · note: highlight [data-test-id="integration-timer-tip"] matched nothing on /
- 2026-10-18T01:38:24Z · note: review pass 8: needs some work
- 2026-10-18T01:38:25Z · needs_input
- 2026-10-18T01:38:38Z · note: waitFor [data-test-id="integration-timer"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T01:38:39Z · note: click [data-test-id="integration-timer"]: click: Timeout 5000ms exceeded. on /
- 2026-10-18T01:38:39Z · note: waitFor [data-test-id="integration-timer-tip"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T01:38:39Z · note: highlight [data-test-id="integration-timer-tip"] matched nothing on /
- 2026-10-18T01:44:07Z · body
- 2026-10-18T02:00:45Z · needs_input
- 2026-10-18T02:00:45Z · status review→active
- 2026-10-18T02:00:45Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-18T02:01:01Z · message_queued at 2026-10-18T02:01:01.675Z
- 2026-10-18T02:01:39Z · body
- 2026-10-18T02:01:52Z · body
- 2026-10-18T02:02:30Z · body
- 2026-10-18T02:03:06Z · status active→review
- 2026-10-18T02:04:14Z · note: review pass 9: needs some work
- 2026-10-18T02:04:14Z · needs_input
- 2026-10-18T02:04:16Z · note: waitFor [data-test-id="integration-timer"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T02:04:16Z · note: click [data-test-id="integration-timer"]: click: Timeout 5000ms exceeded. on /
- 2026-10-18T02:04:16Z · note: waitFor [data-test-id="integration-timer-tip"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T02:04:17Z · note: highlight [data-test-id="integration-timer-tip"] matched nothing on /
- 2026-10-18T02:04:36Z · note: waitFor [data-test-id="integration-timer"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T02:04:36Z · note: click [data-test-id="integration-timer"]: click: Timeout 5000ms exceeded. on /
- 2026-10-18T02:04:36Z · note: waitFor [data-test-id="integration-timer-tip"]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T02:04:37Z · note: highlight [data-test-id="integration-timer-tip"] matched nothing on /
- 2026-10-18T02:06:00Z · status review→active
- 2026-10-18T02:06:02Z · needs_input
- 2026-10-18T02:06:45Z · message_queued at 2026-10-18T02:06:45.766Z
- 2026-10-18T02:11:08Z · status active→review
- 2026-10-18T02:11:08Z · note: shots: skipped — 8 handoff shots already captured for this exact plan (346573abc) during finalization (#0734)
- 2026-10-18T02:11:10Z · note: shots: skipped — 8 handoff shots already captured for this exact plan (346573abc) during finalization (#0734)
- 2026-10-18T02:12:24Z · note: review pass 10: needs some work
- 2026-10-18T02:12:24Z · needs_input
- 2026-10-18T02:15:29Z · status review→active
- 2026-10-18T02:15:31Z · needs_input
- 2026-10-18T02:15:33Z · message_delivered: 2 message(s)
- 2026-10-18T02:16:14Z · message_queued at 2026-10-18T02:16:14.532Z
- 2026-10-18T02:16:46Z · body
- 2026-10-18T02:17:30Z · body
- 2026-10-18T02:18:08Z · note: handoff requested (ui-review)
- 2026-10-18T02:26:11Z · status active→review
- 2026-10-18T02:27:20Z · note: review pass 11: needs some work
- 2026-10-18T02:27:21Z · needs_input


---
id: "0778"
title: "Easter eggs bundle: Shots validator and review card wording"
type: bug
status: review
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-shots-validator-and-r
cli_override: claude code
model_override: haiku
review_cli_override: opencode
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-14T07:43:09Z"
updated_at: "2026-10-14T15:59:21Z"
review_passes: 4
review_rounds: 2
dev_error_count: 4
---
## Problem
Small cosmetic and validation bugs found on 2026-10-14. They are bundled because each is small and independent.

1. Shot can't be deleted when its state is invalid. A task whose ## Shots list contains an unknown state fixture (for example board:cardChips on #0776) fails the Shots validator. The UI then refuses to delete any shot on that task, so the bad shot can't be removed.
2. Duplicate text on the 'Waiting for you' card. src/server/review.ts ~1675 writes the same sentence to needsInputDetail as to the reason, so the card shows it twice.
3. The Repo Context page has no 'Open in editor' link on the doc viewer. The task Spec section already has one at the top right of the box; the doc viewer should match it.
4. On the Changes tab, the 'Add shot' and 'Refresh evidence' buttons are not right-aligned. Both should be pulled to the right, with 'Add shot' furthest right.
5. The close-out Cancel and Retry buttons on the stalled-task card sit on the left of the card. Move them to the right side, above the expand arrow.

## Desired UX
- Deleting a shot works even when other entries on the task are invalid. Validate only what is being written, and let the user remove the invalid entry.
- The Waiting-for-you card shows the reason once. The detail carries something different (for example the last review's verdict line), or is hidden when it would repeat the reason.
- The Repo Context doc viewer has an 'Open in editor ↗' link in the same place and style as the task Spec section.
- On the Changes tab toolbar, 'Refresh evidence' sits to the right of the section label, with 'Add shot' furthest right.
- On the stalled close-out card, Cancel and Retry sit on the right side, above the expand arrow.

## Acceptance criteria
- Test: deleting a shot on a task with one invalid entry succeeds and removes only the selected entry.
- Test: the Waiting-for-you card shows the reason once when the detail would repeat it.
- CLI: repoos update --shots '[]' is rejected ('expected at least one shot'). Either accept an empty list to clear all shots, or document the --section Shots --section-body '' way.
- Repo Context doc viewer shows the Open in editor link, matching the task Spec styling, in light and dark themes.
- Changes tab buttons are right-aligned in that order, checked in light and dark themes.
- Stalled close-out card buttons sit on the right, checked in light and dark themes.

## Notes for AI
Source: user reports 2026-10-14 on #0776 (shot delete error), the Waiting-for-you card, the Repo Context doc viewer, the Changes tab toolbar and the stalled close-out card (#0779). Items are small and independent; commit per item so a reviewer can read them separately.

## Shots
```json
[
{
"label": "Repo Context doc viewer with Open in editor link (light)",
"target": "default",
"route": "/repo?doc=docs/README.md",
"highlight": "[data-test-id=\"context-open-in-editor\"]",
"theme": "light"
},
{
"label": "Repo Context doc viewer with Open in editor link (dark)",
"target": "default",
"route": "/repo?doc=docs/README.md",
"highlight": "[data-test-id=\"context-open-in-editor\"]",
"theme": "dark"
},
{
"label": "Changes tab Refresh evidence and Add shot pulled right (light)",
"target": "default",
"route": "/work?task=0778&tab=changes",
"highlight": ".changes-summary-actions",
"steps": [
{
"click": "[data-test-id=\"changes-tab-ui\"]"
}
],
"theme": "light"
},
{
"label": "Changes tab Refresh evidence and Add shot pulled right (dark)",
"target": "default",
"route": "/work?task=0778&tab=changes",
"highlight": ".changes-summary-actions",
"steps": [
{
"click": "[data-test-id=\"changes-tab-ui\"]"
}
],
"theme": "dark"
}
]
```

## Shot evidence sequencing
Item 5 (stalled close-out card) is implemented and unit-pinned (DOM order Cancel/Retry, CSS `.tc-pipeline-recover` pushed right via margin-left:auto, above the expand arrow) but NOT captured yet: the shots validator runs MAIN's compiled code at declaration time, and the `closeOut:stalled` fixture it needs ships with THIS branch. Review capture of the stalled card is possible only once the branch lands; at re-handoff the declaration should be /work?status=review + state closeOut:stalled in light and dark (route /work, not /, so the fixture card is in the viewport). Items 3 and 4 now declare light AND dark theme captures — the theme field came in via #0782.

## Activity

- 2026-10-14T07:43:09Z · created · njachowski@gmail.com
- 2026-10-14T07:43:10Z · needs_input
- 2026-10-14T07:43:20Z · body
- 2026-10-14T08:04:32Z · needs_input
- 2026-10-14T08:21:11Z · status inbox→ready
- 2026-10-14T08:26:02Z · body
- 2026-10-14T08:27:02Z · cli_override, model_override
- 2026-10-14T08:27:02Z · cli_override
- 2026-10-14T08:27:05Z · cli_override
- 2026-10-14T08:27:06Z · model_override
- 2026-10-14T08:27:10Z · review_cli_override, review_model_override
- 2026-10-14T08:27:12Z · status ready→active, branch
- 2026-10-14T08:37:39Z · body
- 2026-10-14T08:38:30Z · body
- 2026-10-14T08:39:12Z · body: section Shots
- 2026-10-14T08:45:08Z · status active→review
- 2026-10-14T08:45:47Z · note: highlight .changes-summary-actions matched nothing on /work?task=0778&tab=changes
- 2026-10-14T08:47:18Z · note: review pass 1: needs some work
- 2026-10-14T08:47:19Z · status review→active
- 2026-10-14T08:48:56Z · body: section Shots
- 2026-10-14T08:49:41Z · body
- 2026-10-14T08:51:49Z · body
- 2026-10-14T08:53:42Z · body
- 2026-10-14T08:56:18Z · body
- 2026-10-14T08:56:31Z · message_queued at 2026-10-14T08:56:31.853Z
- 2026-10-14T08:59:54Z · handoff failed · remote validation failed: test failure: tests/task-shots-api.test.ts > DELETE /api/tasks/:id/shots/:name — delete + declaration sync (#0627) > syncs THE exact declaration when the shot carries one (selector/steps included) on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-14T09:05:32Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/task-shots-api.test.ts > DELETE /api/tasks/:id/shots/:name — delete + declaration sync (#0627) > syncs THE exact declaration when the shot carries one (selector/steps included) on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-14T09:05:32Z · note: handoff requested (cli)
- 2026-10-14T09:11:00Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/task-shots-api.test.ts > DELETE /api/tasks/:id/shots/:name — delete + declaration sync (#0627) > syncs THE exact declaration when the shot carries one (selector/steps included) on bee — fix it in the feature branch and re-run the gate
- 2026-10-14T09:19:36Z · agent exited with an error (cursor) · Cannot use this model: composer-2.5. Available models:
- 2026-10-14T11:20:48Z · cli_override, model_override
- 2026-10-14T11:20:50Z · model_override
- 2026-10-14T11:23:51Z · body: section Shots
- 2026-10-14T11:24:31Z · body: section Shots
- 2026-10-14T11:25:52Z · body
- 2026-10-14T11:29:21Z · body
- 2026-10-14T11:29:55Z · status active→review
- 2026-10-14T11:32:13Z · note: review pass 2: needs some work
- 2026-10-14T11:32:13Z · message_queued at 2026-10-14T11:32:13.426Z
- 2026-10-14T11:32:13Z · status review→active
- 2026-10-14T11:36:16Z · status active→review
- 2026-10-14T11:36:16Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (923d3ce98) during finalization (#0734)
- 2026-10-14T11:36:16Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (923d3ce98) during finalization (#0734)
- 2026-10-14T11:38:01Z · note: review pass 3: needs some work
- 2026-10-14T12:04:07Z · status review→active
- 2026-10-14T12:04:09Z · message_delivered: 1 message(s)
- 2026-10-14T12:08:38Z · model_override
- 2026-10-14T12:08:41Z · needs_input
- 2026-10-14T12:08:46Z · agent exited with an error (opencode) · Degenerate output loop detected (a very long run of text with no tool call). Excerpt: "                                                                                                                                                                                                        …". If this is a real loop, restart with a fresh session; if it looks like normal output, it is a false positive.
- 2026-10-14T12:10:09Z · body
- 2026-10-14T12:13:51Z · body: section Shots
- 2026-10-14T12:14:49Z · body
- 2026-10-14T12:15:54Z · body
- 2026-10-14T12:17:13Z · body
- 2026-10-14T12:29:52Z · cli_override, model_override
- 2026-10-14T12:30:03Z · review_cli_override
- 2026-10-14T12:30:07Z · review_model_override
- 2026-10-14T12:30:09Z · needs_input
- 2026-10-14T12:37:47Z · body
- 2026-10-14T12:41:35Z · body
- 2026-10-14T12:49:33Z · status active→review
- 2026-10-14T12:53:21Z · note: review pass 4: needs some work
- 2026-10-14T12:53:21Z · needs_input
- 2026-10-14T13:09:21Z · cli_override
- 2026-10-14T13:09:34Z · cli_override, model_override
- 2026-10-14T13:09:47Z · model_override
- 2026-10-14T13:09:51Z · status review→active
- 2026-10-14T13:09:51Z · note: Verdict needs some work — the code changes for all five bundle items are present and covered by tests, but the stalled close-out card (item 5) has no captured evidence at all, and the --shots '[]' documentation contradicts the new code.
- 2026-10-14T13:24:08Z · message_queued at 2026-10-14T13:24:08.555Z
- 2026-10-14T13:24:08Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-14T13:48:43Z · body
- 2026-10-14T13:50:14Z · note: highlight [data-test-id="task-card-pipeline-retry"] matched nothing on /
- 2026-10-14T14:05:05Z · note: highlight .changes-summary-actions matched nothing on /work?task=0778&tab=changes
- 2026-10-14T14:05:08Z · note: highlight [data-test-id="task-card-pipeline-retry"] matched nothing on /
- 2026-10-14T15:17:17Z · cli_override, model_override
- 2026-10-14T15:18:36Z · needs_input
- 2026-10-14T15:18:37Z · message_queued at 2026-10-14T15:18:37.264Z
- 2026-10-14T15:25:59Z · message_queued at 2026-10-14T15:25:59.377Z
- 2026-10-14T15:25:59Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-14T15:26:56Z · cli_override, model_override
- 2026-10-14T15:27:10Z · message_delivered: 2 message(s)
- 2026-10-14T15:30:33Z · body: section Shots
- 2026-10-14T15:31:23Z · body
- 2026-10-14T15:33:42Z · body
- 2026-10-14T15:35:22Z · body
- 2026-10-14T15:38:45Z · body: section Shots
- 2026-10-14T15:38:53Z · body: section Shot evidence sequencing
- 2026-10-14T15:39:44Z · body
- 2026-10-14T15:41:55Z · handoff failed · remote validation failed: test failure: tests/shot-plan-edit.test.ts > removeDeclarationsForDeletedShot (#0778 review round 3) > leaves a VALID re-stated entry behind when only its state was edited (#0778 review) on bee — fix it in the feature branch and re-run the gate
- 2026-10-14T15:43:04Z · body
- 2026-10-14T15:44:28Z · body
- 2026-10-14T15:52:13Z · body
- 2026-10-14T15:59:21Z · status active→review
- 2026-10-14T15:59:21Z · note: shots: skipped — 6 shots already captured — an engineer-made capture pre-empts the automatic one

---
id: "0816"
title: "Easter eggs bundle: Dev page output and buttons, integration timer, badges, Human list"
type: feature
status: done
priority: p3
area: web
merged_commit: 4d172e6f144a2c22b7ef5a5c5cb9c5c647b87c8d
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-dev-page-output-and-b
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-17T08:02:53Z"
updated_at: "2026-10-17T10:42:47Z"
last_close_out_gate_ms: 95703
last_close_out_gate_at: "2026-10-17T10:42:13.171Z"
review_passes: 2
---
## Problem
Five small UI items, the one open easter-eggs bundle. Items 1 to 4 of the earlier bundle #0814 already landed on main in 3e66d37e9 and are not repeated here.

1. Some card badges are too long: 'doesn't look fully fleshed out' and 'needs a human-only verification step' take a lot of room (src/ui-app/src/lib/needs-input-ui.ts).
2. There is no quick way to see every task that needs a human. Tasks are only in their status columns.
3. On a stopped Dev target, the URL line is clickable and opens a dead page. It should be greyed out.
4. The activity animation looks much bigger in Settings than in the app, because the size is set in ch units that depend on the surrounding font (src/ui-app/src/components/ActivityIndicator.vue, sizeStyle; src/ui-app/src/style.css, --ai-size-ch). The fix is a fixed pixel size per setting, the same on every surface.
5. The animation size control has a slider plus an Auto toggle. Remove the Auto toggle; the slider is the only control, and a tick marks the default.
6. Task cards show a '· open' chip for tasks with no assignee (src/ui-app/src/components/TaskCard.vue, the tc-assignee-chip branch, which shows for any assignee that is not 'ai' or 'human'). Only human-assigned tasks should show a chip. Remove the chip for unassigned tasks too. AI-assigned and unassigned tasks show no assignee chip.

## Desired UX
- Item 1: shorten badge text by a word or two where the meaning stays clear: 'doesn't look fully fleshed out' becomes 'not fully fleshed out'; 'needs a human-only verification step' becomes 'Needs human step'. Review the other long badges and shorten any that lose nothing.
- Item 2: a 'Human' button beside the Archived button. It toggles a list of every task that needs a human, using the same human icon and colour as the human chip on the cards. The list works like the Archived list.
- Item 3: while the target is stopped, the URL is not a link and shows 'Click Start' in grey, matching the Start button. When running, it is a normal link.
- Item 4: the activity animation has a fixed pixel size per setting, the same on every surface (task card, Dev page, Settings preview). The Settings preview size is the reference. Do not solve this by pinning font sizes. The size control's label and value use pixels, not character widths.
- Item 5: no Auto toggle. The slider starts at the saved value (or the default when none is saved), and a tick marks the default position. The 'Shown at in-app size' copy matches what is shown.
- Item 6: only a human-assigned task shows an assignee chip. AI-assigned and unassigned tasks show none.

## Acceptance criteria
- Test: the badges read 'not fully fleshed out' and 'Needs human step'; other shortened badges keep their meaning.
- Test: the Human button lists every task that needs a human, with the human icon and colour, and toggles like Archived.
- Test: a stopped target's URL is not a link and shows 'Click Start' in grey; a running target's URL is a link.
- Test: at one setting, the activity indicator renders at the same pixel width on a task card, the Dev page and the Settings preview.
- Test: the animation size control has no Auto toggle, starts at the saved or default value, shows a tick at the default, and uses pixels.
- Test: a task with no assignee and a task assigned to ai show no assignee chip; a task assigned to a human shows the human chip.
- Light and dark themes checked; keyboard operable.

## Notes for AI
Start from src/ui-app/src/lib/needs-input-ui.ts (badge text), the Archived list (grep 'Archived') for the Human button, the human chip styling on task cards, the Dev target URL line in src/ui-app/src/views/DevView.vue, the assignee chip in src/ui-app/src/components/TaskCard.vue (item 6), and for items 4 and 5 src/ui-app/src/components/ActivityIndicator.vue, src/ui-app/src/style.css (--ai-size-ch) and the animation size control in src/ui-app/src/views/SettingsView.vue. Use the shared tooltip or popover component (AGENTS.md). Source: user requests 2026-10-17.

## Shots
```json
[
{
"label": "Work board - Human button opens the human-assigned list; only a human task shows a chip (item 6)",
"target": "default",
"route": "/work",
"highlight": ".human-toggle, .human-rows",
"steps": [
{
"click": ".human-toggle"
},
{
"waitMs": 300
}
],
"state": "board:cardChips"
},
{
"label": "Dev page - running URL is a link, stopped URL shows greyed Click Start",
"target": "default",
"route": "/dev",
"highlight": ".dev-open, [data-test-id=\"dev-url-stopped\"]",
"state": "dev:running"
},
{
"label": "Settings - animation size slider in pixels, no Auto toggle, default tick",
"target": "default",
"route": "/settings?tab=general",
"highlight": "#setting-activityAnimationSize, .activity-animation-preview"
}
]
```

## Activity

- 2026-10-17T08:02:53Z · created · njachowski@gmail.com
- 2026-10-17T08:05:33Z · body
- 2026-10-17T08:15:27Z · status inbox→ready
- 2026-10-17T08:15:31Z · status ready→active, branch
- 2026-10-17T08:22:35Z · body
- 2026-10-17T08:23:41Z · body
- 2026-10-17T08:23:42Z · message_queued at 2026-10-17T08:23:42.919Z
- 2026-10-17T08:24:13Z · body: section Shots
- 2026-10-17T08:26:30Z · message_queued at 2026-10-17T08:26:30.553Z
- 2026-10-17T08:26:43Z · body
- 2026-10-17T08:27:09Z · message_queued at 2026-10-17T08:27:09.331Z
- 2026-10-17T08:36:43Z · message_queued at 2026-10-17T08:36:43.889Z
- 2026-10-17T08:36:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-17T08:39:00Z · body
- 2026-10-17T08:46:34Z · status active→review
- 2026-10-17T08:47:25Z · note: review pass 1: needs some work
- 2026-10-17T08:49:58Z · status review→active
- 2026-10-17T08:50:01Z · message_delivered: 4 message(s)
- 2026-10-17T09:01:32Z · body: section Shots
- 2026-10-17T09:03:15Z · body
- 2026-10-17T09:04:13Z · body
- 2026-10-17T09:06:15Z · body
- 2026-10-17T09:15:07Z · body
- 2026-10-17T09:15:08Z · message_queued at 2026-10-17T09:15:08.799Z
- 2026-10-17T09:16:54Z · body: section Shots
- 2026-10-17T09:17:51Z · body
- 2026-10-17T09:19:07Z · cli_override, model_override
- 2026-10-17T09:19:37Z · body
- 2026-10-17T09:27:41Z · status active→review
- 2026-10-17T09:28:48Z · note: review pass 2: good to go
- 2026-10-17T10:21:57Z · message_expired: not delivered within timeout
- 2026-10-17T10:42:13Z · close-out gate completed in 96s
- 2026-10-17T10:42:47Z · status review→done, release:success

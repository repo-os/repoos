---
id: "0795"
title: "Easter eggs bundle: Hub find bar position, Done button, and Escape"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "✗ Server finalization stopped at check: server-side finalization timed out (deadline exceeded). The same worktree can be resumed and retried."
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-hub-find-bar-position
created_at: "2026-10-15T08:02:06Z"
updated_at: "2026-10-15T12:34:35Z"
review_rounds: 1
review_passes: 1
last_check_failure: "repoos check at 2026-10-15T11:36:40.023Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
---
## Problem
Three small issues in the Hub's new Cmd-F find bar (from #0789), plus two small UI fixes for the task cards:
1. The find bar sits at the bottom left of the window. It should be at the top right, like the find bars in other Mac apps.
2. The bar has a 'Replace' option. Find-only is enough, so remove Replace.
3. The 'Done' button does nothing, and there is no other way to close the bar.
4. Task card area chips are separated by commas (for example 'agent, server'). Use spaces instead ('agent server').
5. A task tagged human (not AI) should show a human icon, and the human chip should be a different colour so it stands out, in the same way the file-changes chip is distinct.

## Desired UX
- The find bar opens in the top right corner of the window, over the content.
- Remove the Replace option.
- Close the bar with a button on the right side of the bar (an X, or Done that works), and with Escape. After closing, focus returns to the page.
- Area chips on task cards are space-separated, with no commas.
- Human-tagged tasks show a human icon and a distinct chip colour, both in light and dark themes.

## Acceptance criteria
- Find bar appears in the top right of the window in light and dark appearance, with no Replace control.
- Done or the close button hides the bar and clears highlights; Escape does the same.
- Test or manual check: Cmd-F, type, Escape closes, Cmd-F reopens with the field focused.
- Task card area chips render as 'agent server', not 'agent, server'.
- A human-tagged task card shows the human icon and the distinct chip, checked in light and dark themes.

## Notes for AI
Find bar: macos/RepoOSHub/ServerWebView.swift and the Find menu in macos/RepoOSHub/RepoOSHubApp.swift. Task cards: find the area chip rendering in src/ui-app/src/components (TaskCard.vue) and the existing file-changes chip styling for the human chip. Source: user request 2026-10-15.

## Shots
```json
[
{
"label": "Work card: space-separated area chip and violet human chip (light)",
"target": "default",
"route": "/work",
"highlight": ".tc-area-chip, .tc-human-chip",
"state": "board:cardChips",
"theme": "light"
},
{
"label": "Work card: space-separated area chip and violet human chip (dark)",
"target": "default",
"route": "/work",
"highlight": ".tc-area-chip, .tc-human-chip",
"state": "board:cardChips",
"theme": "dark"
}
]
```

## Activity

- 2026-10-15T08:02:06Z · created · njachowski@gmail.com
- 2026-10-15T08:08:00Z · status inbox→ready
- 2026-10-15T10:18:20Z · body
- 2026-10-15T10:19:12Z · status ready→active, branch
- 2026-10-15T10:35:25Z · body
- 2026-10-15T10:42:14Z · message_queued at 2026-10-15T10:42:14.090Z
- 2026-10-15T10:42:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T10:46:27Z · body: section Shots
- 2026-10-15T10:51:23Z · body
- 2026-10-15T10:53:14Z · body
- 2026-10-15T11:01:33Z · body
- 2026-10-15T11:36:37Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-15T11:40:18Z · status active→review
- 2026-10-15T11:40:19Z · note: handoff requested (cli)
- 2026-10-15T11:40:46Z · note: highlight .tc-area-chip, .tc-human-chip matched nothing on /
- 2026-10-15T11:40:52Z · note: highlight .tc-area-chip, .tc-human-chip matched nothing on /
- 2026-10-15T11:45:30Z · body
- 2026-10-15T11:47:54Z · status active→review
- 2026-10-15T11:47:54Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (af62803c9) during finalization (#0734)
- 2026-10-15T11:47:56Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (af62803c9) during finalization (#0734)
- 2026-10-15T11:49:15Z · note: review pass 1: needs some work
- 2026-10-15T11:49:16Z · status review→active
- 2026-10-15T11:51:10Z · body: section Shots
- 2026-10-15T11:52:35Z · body
- 2026-10-15T12:12:03Z · message_queued at 2026-10-15T12:12:03.446Z
- 2026-10-15T12:12:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T12:34:34Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: server-side finalization timed out (deadline exceeded). The same worktree can be resumed and retried.
- 2026-10-15T12:34:34Z · status active→review
- 2026-10-15T12:34:35Z · note: handoff requested (cli)

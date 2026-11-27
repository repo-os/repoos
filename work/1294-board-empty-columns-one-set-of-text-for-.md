---
id: "1294"
title: "Board empty columns: one set of text for all themes, plus a setting to override it"
type: feature
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: t@t
branch: feat/board-empty-columns-one-set-of-text-for-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-27T22:00:43Z"
updated_at: "2026-11-27T23:14:24Z"
---
## Problem

Empty Work Queue columns show different text in the Gen Z theme than in the other themes, Draft is forced to a bare dash, and there is no way to choose the text.

## Desired UX

Every theme shows the same plain text for an empty column:

| Column | Text |
| --- | --- |
| Draft | No drafts yet |
| Inbox | Nothing waiting in the inbox |
| Ready | Nothing ready to start |
| Active | Nothing in progress |
| Review | No tasks waiting for review |
| Done | Nothing finished yet |

Settings gains one text field, "Empty column text". When filled (for example `-`), every empty board column shows that string. When blank, each column shows its default above.

## Acceptance criteria

- The Gen Z empty-column strings are removed; all themes use the table above.
- Draft shows "No drafts yet", both on the full board and when the board is filtered to one status.
- A new project setting in the `[board]` section of `repoos.toml` stores the override, registered in `getConfigSchema()` with a Settings UI control on the appropriate tab.
- A non-empty value replaces the text in every empty Work Queue column; blank or whitespace restores the defaults. The change shows without a server restart.
- Gen Z keeps its empty-column styling (including the small gradient square); only the wording changes.
- Collapsed columns and the Inputs page are unchanged.
- Tests cover the defaults, the override, the blank value and the Settings control.
- User docs describing board settings are updated.
- The tracked `repoos.toml` is not edited by this task.

## Notes for AI

Start at `src/ui-app/src/components/BoardColumn.vue` (`GENZ_EMPTY`, `PLAIN_EMPTY`) and `src/ui-app/src/views/WorkView.vue` (the two `empty-text` dash props). Follow how `board.doneCollapsedByDefault` is wired through `src/core/config.ts` and `src/core/types.ts`. No new dependencies and no other new UI.

## Shots
```json
[
{
"label": "Work Queue empty column copy",
"target": "default",
"route": "/work",
"highlight": ".board",
"state": "work:empty"
}
]
```

## Screenshots

![Work Queue empty columns](/api/tasks/1294/attachments/att_9fa54638-2b31-42d1-9d6d-1a0715b1271f.webp)

## Activity

- 2026-11-27T22:00:43Z · created · t@t
- 2026-11-27T22:00:44Z · screenshots
- 2026-11-27T22:00:47Z · cli_override, model_override
- 2026-11-27T22:00:49Z · status inbox→ready
- 2026-11-27T22:00:50Z · status ready→active, branch
- 2026-11-27T22:04:03Z · body
- 2026-11-27T22:11:48Z · message_queued at 2026-11-27T22:11:48.156Z
- 2026-11-27T22:11:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-27T22:15:47Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-27T22:15:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The scoped test run is still progressing and has passed the files reported so far. It is exercising the repo’s configured changed-path suite, which is much broader than the files in this change; I’m letting the required check finish before… · stderr: Reading additional input from stdin...
- 2026-11-27T22:15:48Z · message_delivered: 1 message(s)
- 2026-11-27T22:16:48Z · message_queued at 2026-11-27T22:16:48.421Z
- 2026-11-27T22:16:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-27T22:21:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-27T22:35:18Z · queued message undelivered for 18m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-27T22:35:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The corrected Settings test now passes in isolation. The required changed-path check has started; it is running the remote validation stage against the current worktree checkpoint. · stderr: 2026-11-27T22:15:50.311325Z ERROR codex_core::util: Custom tool call output is missing for call id: call_e7daf1676a0d4ec28a940692470dcd38 2026-11-27T22:15:54.524419Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 78334 2026-11-27T22:15:54.527970Z ERROR codex_core::util: Custom tool call …
- 2026-11-27T22:35:18Z · message_delivered: 1 message(s)
- 2026-11-27T22:36:48Z · message_queued at 2026-11-27T22:36:48.726Z
- 2026-11-27T22:36:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-27T22:41:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-27T22:53:20Z · body
- 2026-11-27T23:14:24Z · body

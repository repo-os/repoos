---
id: 1003
title: "Easter eggs bundle: plain-language status and merge wording"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-01T15:37:17Z"
updated_at: "2026-11-01T15:39:05Z"
---
## Items
- [ ] **E1 · Replace “wedged” with heartbeat wording** (web) — describe a live check with an overdue heartbeat as “No recent heartbeat” and show when its last heartbeat arrived. Source: Nick's UI feedback, 2026-11-01.
- [ ] **E2 · Replace “landed” and “landable” merge wording** (web) — use plain-language variants of “merged into main” for completed merges and “ready to merge” for eligible changes. Source: Nick's terminology feedback, 2026-11-01.


## E1 · Replace “wedged” with heartbeat wording

### Problem

“Wedged” is internal jargon and does not tell a user what RepoOS observed. The checks page can show this label for a check process whose heartbeat has stopped updating.

### Desired UX

Use “No recent heartbeat” and show the last heartbeat time. Preserve the distinction between a process that is alive but not reporting and a process that has exited.

### Acceptance criteria

- Test: checks page renders “No recent heartbeat” for a live slot whose heartbeat is older than the configured threshold, and includes the last heartbeat age.
- Test: a fresh heartbeat is not described as missing or stalled.

### Notes for AI

Keep internal identifiers and code comments as appropriate; this item concerns text shown to users. Avoid implying the process is dead when RepoOS only knows that its heartbeat is stale.

## E2 · Replace “landed” in user-facing merge messages

### Problem

“Landed” is ambiguous in user-facing notifications and summaries. Users should be told plainly where the task's changes went.

### Desired UX

When a task's changes have been merged into the main branch, say “merged into main.” Use wording that states the actual destination for other outcomes rather than using “landed” as a generic success verb.

### Acceptance criteria

- Test: successful Move to done notifications and summaries say the task was merged into main.
- Test: copy for non-merge events does not claim a merge occurred.

### Notes for AI

Limit the change to user-facing text. Internal code comments and technical descriptions may retain “landed” where it is precise and not presented as product copy.

## Screenshots

![Screenshot-2026-11-01-at-23.30.22](/api/tasks/1003/attachments/att_1cfc9082-f10e-43ff-8458-3edfc582e276.png)
![Screenshot-2026-11-01-at-23.31.44](/api/tasks/1003/attachments/att_6dfbfffd-07f3-4c0f-8e59-f8a6df429326.png)
![Screenshot-2026-11-01-at-23.30.58](/api/tasks/1003/attachments/att_b17f9b26-3b1a-4276-9c56-124c2c78c9b9.png)

## Activity

- 2026-11-01T15:37:17Z · created · njachowski@gmail.com
- 2026-11-01T15:37:19Z · screenshots
- 2026-11-01T15:39:05Z · body: Items (added 1, removed 2)

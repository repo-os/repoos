---
id: "0705"
title: Remote runners tab and dispatcher must see standalone self-check slot holders (they starved close-outs); add refresh feedback
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T03:31:15Z"
updated_at: "2026-10-06T03:31:15Z"
---
## Problem

Overnight 2026-10-06 the Checks > Remote runners tab showed every host "idle", "queue empty", "0/2 in flight" while real work was running and waiting: four engineer self-checks had live ssh sessions to the same host (all to nick@bee at one point, aged 4-23 minutes), and a close-out for task 0693 failed THREE times in a row with "remote validation unavailable: another repoos check is already running on bee — waited 590s for a free host slot (the per-host limit is shared by the server and standalone checks)" (check_runs, 02:44Z, 03:04Z, 03:17Z). The server dispatcher counts only the runs IT dispatched ("fewest active runs"), so standalone `repoos check` runs (engineer self-checks, now remote since #0694) are invisible to it: it kept choosing the host the self-checks had already filled, then waited its whole 10-minute close-out budget on the host-side lock and timed out. The tab also hid the real queue: waiting standalone checks are not shown anywhere, so an operator cannot tell "idle" from "blocked behind four invisible jobs". Separately, the Refresh button gives no feedback: clicking it appears to do nothing, so there is no way to tell success from failure.

## Desired UX

- The Remote runners tab shows EVERYTHING holding or waiting for a host slot, not only server-dispatched jobs: for each host the lock holders and waiters with task id (or "standalone check in <worktree>"), phase (self-check / pre-review / close-out / release), age, and queue position. "idle" means truly idle.
- The dispatcher counts host-side lock holders and waiters (read them from the host lock files or have standalone checks register with the server) when choosing the host with the fewest active runs, so a close-out never queues behind a pile of self-checks on one host while another host is free.
- Close-out and release gates take priority over engineer self-checks for a slot (a close-out must never starve behind self-checks).
- A failed "waited N s for a free host slot" says which job(s) held the slot, and retries on another idle host before spending the budget waiting.
- The Refresh button shows an in-progress state (spinner/disabled), then a visible success (updated "just now" with a short toast or check mark) or failure (error toast with the reason). Use the shared dialog/toast components and styled tooltips per AGENTS.md; keyboard accessible.

## Acceptance criteria

- Tests: dispatcher avoids a host whose slots are held by standalone checks; close-out is not starved by waiting self-checks; the runners view lists standalone holders and waiters; refresh shows loading then success and failure states.
- Docs updated (docs/remote-validation.md, user-docs/check.md). repoos check passes.

## Notes for AI

Read #0694 and #0695 first (engineer self-checks on runners; item 6 there covers the self-check path pinning the first host: coordinate, do not duplicate), #0683 (probe/fallback visibility) and docs/remote-validation.md (host lock, maxConcurrent per host). Evidence: sqlite3 .repoos/checks.db "select ... from check_runs where task_id=0693" and the owner screenshot of the Remote runners tab at 11:29 local showing all hosts idle.

## Activity

- 2026-10-06T03:31:15Z · created · unknown

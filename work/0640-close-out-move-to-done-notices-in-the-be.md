---
id: "0640"
title: "Close-out (Move to done) notices in the bell, and stop stale flags on done tasks listing as needing you"
type: feature
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: ""
branch: ""
review_cli_override: claude code
created_at: "2026-10-03T16:49:27Z"
updated_at: "2026-10-03T16:54:59Z"
---
## Problem
1. The top-bar notice bell (NoticeBell.vue) only knows release notices: NoticeKind is releaseNotesReady | releaseSucceeded | releaseFailed (src/ui-app/src/stores/notices.ts). A Move to done (close-out) that succeeds, fails or times out produces nothing there, so the user has to open the task to learn the outcome. A failed MTD is also not a 'task needing you': the task stays in review and the bell lists it only as 'awaiting sign-off'.
2. The 'Tasks needing you' list in the bell is wrong for finished work: humanNeedsReasons (src/ui-app/src/stores/repo.ts) excludes status done only for the 'assigned to you' reason. needs_input and needs_merge still count on done tasks, so #0397, #0288 and #0212 (needs_merge: true) and #0316 (needs_input: true, reason dev-error) are listed forever although their status is done. They look like leftovers from metadata-only moves to done (see AGENTS.md on repoos mv done).

## Desired behaviour
- New notice kinds: closeOutSucceeded, closeOutFailed, closeOutTimedOut (keep timeout separate from failure so the title and advice differ). Each notice has: title naming the task (e.g. 'Move to done: #0633 landed' / 'failed' / 'timed out after 6m'), a short detail (first line of the failure reason; for timeouts the budget and the closeOut.timeoutMs hint), a link to the task, and a createdAt timestamp.
- Timestamps: createdAt is the time the close-out FINISHED (the server's integration-job finish time), not when the UI first saw it; the bell row shows it via the existing relTime display (like release notices), and the full time is available on focus or tap in a styled tooltip (no native title). The server-recorded time survives reloads and shows the same on every client.
- Source of truth is server-side: record a durable close-out outcome event (task id, outcome, finishedAt, reason) when the integration job ends, and expose it over the existing task SSE and a list endpoint so notices appear even if the UI was closed while the MTD ran. Dedupe per task and finished-run (id = <kind>:<taskId>:<finishedAt>), like release notices; a retry that later succeeds produces a new notice and does not resurrect a dismissed one.
- Honour the existing dismiss / mark-read / badge behaviour, and the sound and push channels with per-type toggles. Add the three kinds to the notification-type toggles in Settings with clear copy (user-facing setting rule in AGENTS.md), plus a test.
- Cancelled MTD (Stop MTD) produces no notice.
- Stale flags: humanNeedsReasons ignores needs_input and needs_merge once status is done (only done is filtered; review/active behave as today). Add a test for each reason on a done task.
- Cleanup of the four known tasks: check each branch with git branch --merged main (and the close-out record). If merged, clear the stale flags through RepoOS (repoos update / API, never by hand-editing work/*.md). If NOT merged, do not clear anything: report it and file a follow-up task.

## Acceptance criteria
- Unit tests for the three new kinds' ingest (dedupe, dismiss persistence, read/unread badge, createdAt equals the server finish time, ordering newest first) and for the server-side outcome event on success, failure and timeout paths.
- The bell shows a close-out notice with a relative timestamp and the exact time on hover/focus; clicking opens the task drawer.
- Settings has toggles for the new kinds; a toggle off suppresses sound/push but keeps the notice (match the release notice behaviour).
- humanNeedsReasons tests as above; the bell no longer lists done tasks for needs_input or needs_merge.
- Record of the four tasks' branch status and what was done in the task notes.
- user-docs updated (notices and notification settings).

## Notes for AI
- Release notices are the pattern: stores/notices.ts ingestReleaseRun, NOTICE_KIND_LABELS, NOTICE_KIND_COLOR (use CSS tokens only; the hardcoded-colors guard applies), fireChannels.
- The close-out timeout reason text comes from closeOutTimeoutReason in src/server/integration-orchestrator.ts; reuse it for the detail line instead of re-parsing logs.
- Do not touch the drift or timeout logic of the pipeline itself here (see #0637). This task only observes outcomes.
- Done-status filter fix could be hotfixed separately, but keep it in this task unless the human asks.

## Activity

- 2026-10-03T16:49:27Z · created · unknown
- 2026-10-03T16:54:57Z · review_cli_override
- 2026-10-03T16:54:59Z · review_cli_override

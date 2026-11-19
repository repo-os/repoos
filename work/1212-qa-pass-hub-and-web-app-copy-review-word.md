---
id: "1212"
title: "QA pass: Hub and web app copy review – wording, plain-English errors and consistent terminology"
type: chore
status: active
priority: p3
area: [web, mobile, macos]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-hub-and-web-app-copy-review-word
created_at: "2026-11-19T00:47:39Z"
updated_at: "2026-11-19T02:07:21Z"
last_handoff_failure_fingerprint: "check|the worktree changed while the gate was running (appeared: src/ui-app/src/lib/shot-preview-fixtures.ts, src/ui-app/tests/mobile-work-queue.test.ts, src/ui-app/tests/remote-validation-drawer.test.ts, src/ui-app/tests/shot-preview-fixtures.test.ts, src/ui-app/tests/work-queue-visibility.test.ts) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
last_handoff_failure_sha: 987e0e851e0df1a9a915aab143e4b54969778242
last_check_failure: "repoos check at 2026-11-19T01:25:43.917Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_passes: 2
review_rounds: 1
routing_switches: 1
deferred_handoff_resume_count: 1
---
## Problem
Wording across the web app and Hub apps may be inconsistent or jargon-heavy (infra terms in user-facing errors).
## Desired UX
Errors and labels use plain English and consistent names for the same things (server, project, runner, agent).
## Acceptance criteria
- Read UI strings in src/ui-app, mobile/ and macos/; fix the worst jargon and inconsistencies with tests where strings are asserted; headless browsers only, never visible.
- Commit docs/qa/2026-11-copy-review.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Plain-language server connection error",
"target": "default",
"route": "/work?shotState=work:failedLoad",
"highlight": "[data-testid=\"work-load-error\"]"
}
]
```

## Activity

- 2026-11-19T00:47:39Z · created · t@t
- 2026-11-19T00:47:42Z · status inbox→ready
- 2026-11-19T00:47:44Z · status ready→active, branch
- 2026-11-19T00:54:50Z · body
- 2026-11-19T00:58:15Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T00:58:16Z · status active→review
- 2026-11-19T00:58:16Z · message_queued at 2026-11-19T00:58:16.919Z
- 2026-11-19T00:59:00Z · note: review pass 1: needs some work
- 2026-11-19T00:59:01Z · status review→active
- 2026-11-19T00:59:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T00:59:11Z · message_delivered: 1 message(s)
- 2026-11-19T00:59:28Z · CTO nudge: held — remote validation is running
- 2026-11-19T01:08:13Z · body
- 2026-11-19T01:08:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T01:12:47Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-19T01:12:48Z · message_queued at 2026-11-19T01:12:48.503Z
- 2026-11-19T01:13:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T01:16:01Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T01:16:02Z · message_delivered: 1 message(s)
- 2026-11-19T01:23:39Z · body
- 2026-11-19T01:24:50Z · status active→review
- 2026-11-19T01:25:40Z · message_queued at 2026-11-19T01:25:40.805Z
- 2026-11-19T01:25:40Z · note: shots: failed — browser capture cancelled
- 2026-11-19T01:25:41Z · note: review pass 2: needs some work
- 2026-11-19T01:25:43Z · message_delivered: 1 message(s)
- 2026-11-19T01:26:14Z · note: adopted orphaned engineer pid 18646
- 2026-11-19T01:37:36Z · status review→active
- 2026-11-19T01:37:39Z · message_queued at 2026-11-19T01:37:39.007Z
- 2026-11-19T01:39:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T01:40:44Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T01:40:44Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The check slot opened and the build and tests are now running remotely. This is the full check, so it’s taking longer than the earlier changed-path pass; no failures have appeared in the output so far. · stderr: (empty)
- 2026-11-19T01:40:44Z · status active→review
- 2026-11-19T01:40:45Z · message_delivered: 1 message(s)
- 2026-11-19T01:40:46Z · note: handoff requested (cli)
- 2026-11-19T01:41:12Z · CTO nudge: held — handoff gate is running
- 2026-11-19T01:50:18Z · body
- 2026-11-19T01:58:24Z · message_queued at 2026-11-19T01:58:24.873Z
- 2026-11-19T01:58:25Z · handoff failed · task-file handoff failed at check · the worktree changed while the gate was running (appeared: src/ui-app/src/lib/shot-preview-fixtures.ts, src/ui-app/tests/mobile-work-queue.test.ts, src/ui-app/tests/remote-validation-drawer.test.ts, src/ui-app/tests/shot-preview-fixtures.test.ts, src/ui-app/tests/work-queue-visibility.test.ts) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-11-19T02:01:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T02:05:35Z · body
- 2026-11-19T02:07:13Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-19T02:07:13Z · message_queued at 2026-11-19T02:07:13.850Z
- 2026-11-19T02:07:16Z · ↻ resuming engineer to read queued message
- 2026-11-19T02:07:21Z · note: handoff requested (cli)

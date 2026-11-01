---
last_close_out_gate_ms: 756475
last_close_out_gate_at: "2026-11-01T14:58:20.128Z"
id: "0998"
title: Stop runtime model pause updates from blocking close-out as dirty config
type: bug
status: review
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stop-runtime-model-pause-updates-from-bl
model_override: composer-2.5
created_at: "2026-11-01T09:46:53Z"
updated_at: "2026-11-01T14:58:20Z"
last_check_failure: "repoos check at 2026-11-01T13:59:35.581Z: repoos check failed: tests — dir: undefined,"
handoff_signal_retry_count: 1
dev_error_count: 2
---
## Problem
Nick repeatedly sees FAIL Main clean because repoos.toml is dirty, usually only from model allowlist pause/quota bookkeeping. During the 2026-11-01 recovery, automatic pausedModels.pausedUntil updates dirtied main repeatedly while #0993 was trying to close out. evaluateMainCleanCheck in src/core/landable.ts blocks any dirty file; the /done enqueue guard in src/server/routes/tasks.ts rejects before the publication-stage automatic config checkpoint can help. Runtime updates therefore force human commits and make an otherwise healthy pipeline look broken.

## Desired UX
Automatic model quota/pause/reprobe updates do not create false main-clean blockers or require a manual commit. Preserve the human-approved allowlist and pause behavior, durable restart recovery, and meaningful protection for genuine human configuration changes. Prefer separating runtime state from tracked configuration, or another narrowly classified and race-safe approach justified against existing config-write behavior. Do not exempt all repoos.toml edits or silently checkpoint unrelated human settings.

## Acceptance criteria
- [ ] Identify every automatic allowlist pause/resume/quota probe write and ensure runtime-only changes do not dirty tracked config or block landable, /done enqueue, integration validation, or publication.
- [ ] Preserve explicit human allowlist membership, pause/resume intent, expiry semantics, paused-model selection restrictions, and restart persistence. Document precedence/migrate existing stored runtime data if storage changes.
- [ ] Genuine settings edits, mixed runtime plus human edits, unknown keys, parse failures, and unrelated source WIP retain the appropriate dirty-main protections and actionable messages.
- [ ] A quota/pause update racing close-out cannot lose either update, stage unrelated files, change the validated source tree, or publish an unvalidated candidate.
- [ ] Tests reproduce runtime-only updates before enqueue and during publication, mixed edits, expiry/restart behavior, and unknown/invalid config; verify CLI/UI landability and actual close-out agree.
- [ ] Update directly affected configuration, budget control, and close-out documentation and AGENTS.md if its checkpoint workaround is superseded.

## Notes for AI
Use RepoOS workflow and a dedicated task worktree. This is lifecycle/config persistence work, not an easter egg. Read #0682 and existing config checkpoint logic before choosing a design. Inspect src/core/budget-allowlist.ts, src/core/config.ts, the automatic quota-pause/probe writers, src/core/landable.ts, src/server/routes/tasks.ts, and src/server/integration-orchestrator.ts. Do not weaken the allowlist, bypass checks, ignore all config diffs, or auto-commit arbitrary user work. Nick authorized expansion to three engineers on 2026-11-01 after a normal RepoOS pressure verdict. Run one scoped check with remote validation; do not launch overlapping local test suites.

## Activity

- 2026-11-01T09:46:53Z · created · njachowski@gmail.com
- 2026-11-01T09:56:20Z · status inbox→ready
- 2026-11-01T09:56:29Z · status ready→active, branch
- 2026-11-01T09:57:33Z · body: Notes for AI (added 1, removed 1)
- 2026-11-01T09:57:33Z · message_queued at 2026-11-01T09:57:33.868Z
- 2026-11-01T10:02:44Z · message_queued at 2026-11-01T10:02:44.126Z
- 2026-11-01T10:11:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T10:13:30Z · engineer stopped by request
- 2026-11-01T10:13:43Z · message_delivered: 2 message(s)
- 2026-11-01T10:31:49Z · message_queued at 2026-11-01T10:31:49.078Z
- 2026-11-01T10:31:49Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T10:35:43Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-11-01T10:36:13Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/12 crashes in 30m) · RetriableError: Connection stalled repeatedly
- 2026-11-01T10:36:16Z · needs_input
- 2026-11-01T10:36:16Z · message_delivered: 1 message(s)
- 2026-11-01T10:38:18Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-01T10:41:47Z · engineer crash recovery: resuming cursor + grok-4.7-low (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-01T11:06:03Z · watchdog: restarting engineer after 24m with no live process
- 2026-11-01T11:34:15Z · body
- 2026-11-01T11:45:41Z · message_queued at 2026-11-01T11:45:41.832Z
- 2026-11-01T11:45:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T11:50:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T12:02:40Z · body
- 2026-11-01T12:17:27Z · body
- 2026-11-01T12:20:59Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T12:20:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T12:20:59Z · message_delivered: 1 message(s)
- 2026-11-01T12:38:17Z · body
- 2026-11-01T12:40:41Z · CTO nudge: held — handoff gate is running
- 2026-11-01T12:54:34Z · body
- 2026-11-01T14:05:17Z · message_queued at 2026-11-01T14:05:17.003Z
- 2026-11-01T14:05:17Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T14:08:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T14:13:14Z · model_override
- 2026-11-01T14:19:14Z · body
- 2026-11-01T14:21:35Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T14:21:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T14:21:35Z · message_delivered: 1 message(s)
- 2026-11-01T14:24:01Z · status active→review
- 2026-11-01T14:24:01Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-01T14:24:57Z · note: review pass 1: good to go
- 2026-11-01T14:58:20Z · close-out gate completed in 756s


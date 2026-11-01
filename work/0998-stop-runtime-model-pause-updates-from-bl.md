---
id: "0998"
title: Stop runtime model pause updates from blocking close-out as dirty config
type: bug
status: active
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stop-runtime-model-pause-updates-from-bl
created_at: "2026-11-01T09:46:53Z"
updated_at: "2026-11-01T10:13:30Z"
handoff_signal_retry_count: 1
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

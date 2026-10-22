---
handoff_signal_retry_count: 2
id: "0927"
title: Define named project environments and file-backed storage
type: feature
status: active
human_step_decision: agent
human_step_decision_key: 16ca06e1
priority: p1
area: [core, server, docs]
story: Secrets and project environments
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/define-named-project-environments-and-fi
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T08:05:30Z"
updated_at: "2026-10-22T14:56:48Z"
review_rounds: 1
review_passes: 1
---
## Problem
RepoOS has legacy root-.env loading but no explicit model for multiple project secret environments. Without a shared contract and safe storage primitives, management APIs and process bindings could mix project values with RepoOS provider/auth settings or silently change legacy behavior.

## Desired UX
A project can register named environment scopes and explicit source-file mappings; existing projects continue using today’s root-.env behavior until they opt in. RepoOS can report a scope’s expected key names, source, and effective metadata without returning values. File updates preserve unrelated text and fail clearly when the source changes concurrently or is unsafe.

## Acceptance criteria
- Add an ADR defining environment identifiers, source mappings, precedence, duplicate-key behavior, legacy compatibility, project-versus-RepoOS credential boundaries, visibility classification, and the allowed consumer/grant model.
- Implement validated metadata and file-backed read/write primitives for explicitly registered sources; do not recursively discover .env* files or infer an environment from filenames or NODE_ENV.
- Preserve comments and unrelated entries; support tested round-trip quoting for spaces, quotes, equals signs, and hash characters, and reject unsupported syntax and multiline values explicitly.
- Writes are atomic and permission-restricted, detect stale concurrent edits, and refuse tracked destinations, unsafe paths, and symlinks.
- .env.example contributes expected key names only, never values; test separate environment sets, source precedence, duplicate keys, safe-path refusals, round trips, concurrent edits, and unchanged legacy loading.
- Add no runtime dependencies; no real secret or external account is needed for tests.

## Notes for AI
Work in the existing config/environment loading and file utility layers under src/core and src/server; inspect the current dotenv parser and legacy loading tests before designing compatibility. Keep this slice to the contract and storage foundation: do not add management routes, UI, or process injection. Update the ADR and directly affected environment/secrets documentation. Never read or expose real values in test output.

## Activity

- 2026-10-22T08:05:30Z · created · njachowski@gmail.com
- 2026-10-22T14:32:10Z · status inbox→ready
- 2026-10-22T14:32:17Z · cli_override, model_override
- 2026-10-22T14:32:18Z · status ready→active, branch
- 2026-10-22T14:36:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T14:42:03Z · message_queued at 2026-10-22T14:42:03.494Z
- 2026-10-22T14:42:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T14:42:51Z · body
- 2026-10-22T14:43:47Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T14:43:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T14:43:48Z · message_delivered: 1 message(s)
- 2026-10-22T14:53:48Z · status active→review
- 2026-10-22T14:53:48Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-22T14:54:52Z · note: review pass 1: needs some work
- 2026-10-22T14:54:53Z · status review→active
- 2026-10-22T14:56:48Z · body


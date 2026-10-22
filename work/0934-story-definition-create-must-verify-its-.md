---
id: "0934"
title: "Story definition create must verify its commit, retry, and surface a failure (untracked story blocked close-outs)"
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/story-definition-create-must-verify-its-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T08:40:11Z"
updated_at: "2026-10-22T11:50:18Z"
handoff_signal_retry_count: 1
---
## Problem
POST /api/stories (src/server/routes/stories.ts, createStoryDefinition) writes the story file and calls commitTaskFile, ignoring its boolean result. 2026-10-22: story #0012 'Secrets and project environments' was created at 08:02:23Z (created_by: api) and its tasks #0927-#0932 were created and committed afterwards, but the story file itself stayed untracked on main (stories/secrets-and-project-environments.md). main then had 1 uncommitted file, so every 'repoos done' refused, and nothing told anyone. This is the same fail-soft class as #0151 (task file commit lost), most likely git contention (index.lock) while many commits ran at once; the exact cause was not captured because the failure is silent.

## Desired UX
- The create route checks the commit result, retries a few times with short backoff, and if it still fails returns 201 with a warning (and shows a toast/banner) instead of silently leaving the file untracked.
- The existing boot sweep and a periodic sweep commit orphaned untracked story and task files under stories/ and work/ (only files RepoOS itself created: frontmatter created_by present), logging a visible activity event.
- Close-out's 'main has uncommitted files' message names stories/ and work/ orphans and offers the checkpoint commit, as it already does for repoos.toml.

## Acceptance criteria
- Test: commit fails once (simulated lock) then succeeds; the story ends up committed.
- Test: commit fails always; response carries a warning and the sweep commits it later.
- Test: close-out refusal text lists the orphan file and the action.

## Notes for AI
Same code path pattern in PATCH /api/stories/:key (commitFiles) and the Telegram create path. Related: #0151, #0933.

## Activity

- 2026-10-22T08:40:11Z · created · njachowski@gmail.com
- 2026-10-22T11:21:07Z · status inbox→ready
- 2026-10-22T11:21:12Z · cli_override, model_override
- 2026-10-22T11:21:12Z · status ready→active, branch
- 2026-10-22T11:23:41Z · body
- 2026-10-22T11:24:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T11:35:04Z · body
- 2026-10-22T11:37:00Z · body
- 2026-10-22T11:50:17Z · note: ui verification passed: 1 shot captured with clean console
- 2026-10-22T11:50:18Z · status active→review

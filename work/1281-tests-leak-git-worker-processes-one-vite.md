---
id: "1281"
title: "Tests leak git worker processes: one vitest run left 48 git-worker-entry processes"
type: feature
status: review
priority: p2
area: [core, server]
assigned_to: ai
created_by: t@t
branch: feat/tests-leak-git-worker-processes-one-vite
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T11:47:41Z"
updated_at: "2026-11-20T16:06:02Z"
---
## Problem
On 2026-11-20 around 19:45 local, a single scoped vitest run in the #1258 engineer worktree had about 48 live src/server/git-worker-entry.ts processes (each several minutes old) plus its vitest workers, and the machine load average reached about 130 on 10 cores. This looks like a test, or the code it exercises, starting git worker processes and not shutting them down.

## Desired UX
A test run leaves no git worker processes behind, and the number alive at once stays bounded, so engineers' scoped checks cannot swamp the machine.

## Acceptance criteria
- Find which tests or code paths spawn git-worker-entry.ts and never terminate it (pool not closed, worker not unref'd or killed in teardown).
- Fix so workers are closed in test teardown and capped in production; add a test that asserts no git worker processes remain after the suite helper exits.
- Document the cap in docs if it is user-visible.

## Notes for AI
Reproduce with bun run test on a scoped path while watching ps for git-worker-entry. Never touch repoos.toml.

## Activity

- 2026-11-20T11:47:41Z · created · t@t
- 2026-11-20T11:48:06Z · status inbox→ready
- 2026-11-20T15:04:05Z · cli_override, model_override
- 2026-11-20T15:04:11Z · status ready→active, branch
- 2026-11-20T16:06:02Z · status active→review

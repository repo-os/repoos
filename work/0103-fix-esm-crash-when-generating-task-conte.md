---
id: "0103"
title: Fix ESM crash when generating task context packs
type: bug
status: ready
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/fix-esm-crash-when-generating-task-conte
created_at: "2026-08-11T16:44:44Z"
updated_at: "2026-08-11T16:48:55Z"
---
## Problem

Starting a ready task crashes during cached context-pack generation with require is not defined. The context-pack module is executed as ESM but calls CommonJS require for node:child_process in its HEAD-hash and worktree-state helpers.

## Desired UX

Starting any ready task succeeds through bootstrap and context-pack generation under the supported Node ESM runtime.

## Acceptance criteria

- [ ] Context-pack runtime code contains no CommonJS require calls.
- [ ] HEAD hashing and worktree-state collection continue to use spawnSync.
- [ ] A regression test executes context-pack generation under Node ESM and fails if require is reintroduced.
- [ ] repoos check passes.
- [ ] Retry starting #0099 successfully after the fix is available.

## Notes for AI

Keep this a zero-runtime-dependency fix. Import node:child_process using ESM syntax and cover the production runtime, not only Bun compatibility behavior.

## Activity

- 2026-08-11T16:48:55Z · body

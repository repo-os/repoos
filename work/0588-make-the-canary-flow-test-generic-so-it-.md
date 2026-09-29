---
id: "0588"
title: Make the canary flow test generic so it works in any managed repo
type: bug
status: inbox
priority: p2
area: [web, core]
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-29T20:19:16Z"
updated_at: "2026-09-29T20:19:16Z"
---
## Problem

The sidebar canary egg shows in every managed repo, but `CANARY_PROMPT` (`src/core/canary.ts`) tells the engineer to bump `CANARY_COUNTER` in `src/core/canary.ts`, a file that only exists in the RepoOS repo. In neung the engineer found nothing to edit and stopped, leaving the task `active`. The egg's digit also comes from RepoOS's own compiled constant via `/api/info` (`src/server/routes/info.ts`), not from the managed repo.

## Goal

The canary smoke test (draft → inbox → ready → active → review → merge → done) works in any managed repo, and the egg's digit reflects that repo's own counter.

## Approach

- Store the counter in a file RepoOS owns in every managed repo (e.g. `.repoos/canary.txt`, one digit 0-9).
- Create it with 0 if missing (from `repoos init` or lazily on first canary run) and commit it to main before the task is created, so the worktree has it (see #0151 in AGENTS.md).
- Rewrite `CANARY_PROMPT` to be repo-agnostic: increment the digit, wrap 9 to 0, touch nothing else.
- Make `/api/info` read the counter from the managed repo's file, defaulting to 0.
- Decide the fate of `src/core/canary.ts` in the RepoOS repo; update `Sidebar.vue` and `info.ts` imports.
- Confirm `repoos check` and the task-asset guard accept the new file.

## Acceptance criteria

- Clicking the egg in a repo with no `src/core/canary.ts` (e.g. neung) produces a task the engineer can finish through to `done`.
- The digit matches the counter file in the viewed repo and advances after a canary merges.
- Existing repos get the file automatically on first canary run.
- The prompt names no RepoOS-specific paths.
- Tests cover the missing-file default, the 9 → 0 wrap, and the info endpoint reading the managed repo.
- `docs/` and `user-docs/` mentions of the canary are updated.

## Activity

- 2026-09-29T20:19:16Z · created · unknown

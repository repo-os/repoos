---
id: "0978"
title: Recover from a stale .git/index.lock; keep the handoff format test out of the real checkout
type: bug
status: inbox
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-29T11:48:54Z"
updated_at: "2026-10-29T11:48:54Z"
---
## Problem
On 2026-10-29 a `.git/index.lock` in the main checkout was left behind at 10:33Z by a git process that died mid-write. For over an hour every git write on main failed with "Unable to create .git/index.lock: File exists": RepoOS's own task-file commits silently stayed uncommitted, `repoos` commands were slow, and the driver's merge of #0977 was refused while its check then ran on unmerged code. Nothing reported it.

Separately, `src/ui-app/tests/handoff.test.ts` ("auto-formats the worktree before the commit gate") writes `src/server/formatted.txt` into the real checkout when run from main, and fails there.

## Desired UX
A stale index.lock never blocks RepoOS for more than a minute, and a test never writes into the real checkout.

## Acceptance criteria
- The server checks `.git/index.lock` (main and each task worktree's git dir) on its maintenance tick. If it is older than 2 minutes and no running git process has the repository open, it is removed and the removal is logged; if a git process is still alive, it is surfaced on the dashboard instead.
- A git write that fails on index.lock is reported as such (task activity and system log), not swallowed.
- Tests with a fake clock and fake process probe: stale lock removed; live lock kept; failure surfaced.
- The handoff auto-format test writes only inside its temporary fixture; it passes when run from the repo root.

## Notes for AI
The task-file commit path is fail-soft (`commitTaskFile`); keep it fail-soft but log the lock. `src/core/git-maintenance.ts` (#0974) has a maintenance tick to reuse. Do not edit repoos.toml.

## Activity

- 2026-10-29T11:48:54Z · created · njachowski@gmail.com

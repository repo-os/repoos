---
id: "0978"
title: Recover from a stale .git/index.lock; keep the handoff format test out of the real checkout
type: bug
status: active
needs_input: true
needs_input_reason: check-wait
needs_input_detail: "waiting: system load is high (6.8× per CPU, limit 3×) — waiting for headroom before starting more work; additional signals: memory compressor use is high (32%, limit 35%) for 12m"
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/recover-from-a-stale-git-index-lock-keep
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-29T11:48:54Z"
updated_at: "2026-10-29T22:08:35Z"
review_rounds: 1
review_passes: 1
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
- 2026-10-29T12:13:06Z · cli_override, model_override
- 2026-10-29T12:13:33Z · status inbox→ready
- 2026-10-29T12:13:42Z · status ready→active, branch
- 2026-10-29T13:33:01Z · status active→review
- 2026-10-29T13:33:02Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-29T13:34:10Z · note: review pass 1: needs some work
- 2026-10-29T13:34:16Z · status review→active
- 2026-10-29T16:46:22Z · watchdog: check wait escalated · waiting: system load is high (6.8× per CPU, limit 3×) — waiting for headroom before starting more work; additional signals: memory compressor use is high (32%, limit 35%) for 12m · next step: let it finish — the wait clears itself when the check starts running; investigate only if it persists
- 2026-10-29T17:38:31Z · engineer stopped by request
- 2026-10-29T17:38:31Z · held, held-reason, held-by, held-at
- 2026-10-29T22:08:35Z · released

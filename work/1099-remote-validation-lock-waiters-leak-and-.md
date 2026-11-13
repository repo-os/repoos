---
id: "1099"
title: Remote validation lock waiters leak and never time out
type: feature
status: inbox
priority: p1
area: core
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-12T19:01:43Z"
updated_at: "2026-11-13T00:45:33Z"
---
## Problem

Remote validation hosts accumulate orphaned lock-waiter scripts. On the ThinkPad (remote validation host for this repo) there were 333 stale `bash -c LOCKROOT="$HOME/.repoos-validate-locks" ...` processes (SLOTS=3 WAIT=900), most over a day old and up to ~3 days, from tasks #1058–#1096. All had ppid 1 or a dead ssh session. No slot was held and nothing was running, yet load average sat at ~27 on 8 cores because each waiter polls with `sleep 5`/`sleep 1`. `wait/` held 334 priority files for pids that never cleaned up.

The waiters defer to any lower-pid waiter at the same priority, so stale entries make live waiters defer forever and WAIT=900 does not end them.

## Acceptance criteria

- A waiter exits after WAIT seconds (or DEADLINE) even while deferring to other waiters, and removes its own `wait/<pid>` file on exit via a trap.
- Deferral ignores `wait/<pid>` files whose pid is no longer alive.
- If the controlling ssh session or parent goes away, the waiter exits.
- Test: start several waiters, kill their parent, assert no waiter or `wait/` file survives past WAIT.

## Notes for AI

The lock script is generated in the remote validation lock code (search for `.repoos-validate-locks` / `_rvslot`). Found 2026-11-13 while checking a host before putting a new project on it. Manual cleanup done: killed waiters older than 1h and removed dead `wait/` files.

## Activity

- 2026-11-12T19:01:43Z · created · t@t
- 2026-11-13T00:45:33Z · cli_override, model_override

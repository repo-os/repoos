---
id: "1083"
title: "Review runner: a stale 'review already running' registration survives review cancel and blocks reviews until the server restarts (seen on #1080)"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T22:52:19Z"
updated_at: "2026-11-09T22:52:19Z"
---
## Problem
On 2026-11-10 #1080 sat in review with a passed handoff for 45+ minutes: `repoos review again 1080` answered "a review is already running for this task" (ReviewRunner.isRunning, src/server/review.ts ~1173), but no reviewer process or session existed (no `claude -p`, no reviewer row since 17:27Z, the last attempt errored with "Can't reach the API server" while the machine was offline). `repoos review cancel 1080` followed by `repoos mv 1080 review` did not clear it. The in-memory running registration leaked when the original reviewer run failed (API outage), so every later review request was refused.

## Desired UX
A failed, killed or cancelled review always releases its running registration; `repoos review again` never reports "already running" without a live reviewer; and a watchdog clears an entry whose process/session is gone after a short timeout.

## Acceptance criteria
1. Release the registration in a `finally` path for every reviewer exit (success, error, API outage, kill, cancel), with tests that simulate a reviewer that rejects/throws before writing a session.
2. `review cancel` clears the registration even if the underlying process is already gone.
3. A watchdog (or canRun check) treats a registration older than the review timeout with no live process as stale, logs it, and clears it.
4. The refusal message says what is running (pid, since when) so a human can tell stale from live.

## Notes for AI
Look at `ReviewRunner.isRunning`/`canRun`/`cancel` in `src/server/review.ts` and the handoff step that starts the review. Do not edit repoos.toml.

## Activity

- 2026-11-09T22:52:19Z · created · njachowski@gmail.com

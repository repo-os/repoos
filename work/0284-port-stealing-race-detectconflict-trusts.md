---
id: "0284"
title: "Port-stealing race: detectConflict trusts the lockfile alone, never probes the port"
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/port-stealing-race-detectconflict-trusts
model_override: deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813
created_at: "2026-08-24T19:31:09Z"
updated_at: "2026-08-25T06:16:45Z"
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

`ServeReaper.detectConflict` (`src/server/serve-reaper.ts`) is the only guard against two `repoos serve` control-plane processes binding port 7171 at once, and it trusts the lockfile (`.repoos/serve.lock`) alone — it never actually probes the port. Two ways that can go wrong:

1. **Missing/stale lockfile + a live process.** If the lockfile is absent (deleted, corrupted, or simply never written yet in some startup ordering) while a real process already holds the port, `detectConflict` returns no conflict and a second `startServer()` call proceeds to `bindOnce()`.
2. **The drain-window race.** `ReloadManager.waitForReplacement` (`src/server/reload.ts`) releases the OLD process's listener (`stopListening()`) partway through every reload attempt, before the replacement is confirmed. If an unrelated bind attempt (e.g. a second `repoos serve` invocation) lands in that window, it can steal the port out from under the reloading process — which then finishes its own failed handoff with no listener left, and no error surfaced anywhere.

Reproduced firsthand during the #0271 investigation: running `rm -f .repoos/serve.lock` then starting a second `repoos serve` while the first was mid-reload-retry caused the second process to bind port 7171, orphaning the first (a live, user-owned foreground process) as a listenerless zombie that kept retrying failed reload attempts forever. The user's actual terminal session was silently knocked off the port with no warning from either process.

## Fix

`detectConflict` (or `bindOnce`) should verify port ownership by actually probing the port (e.g. a raw TCP connect, or `GET /api/health`) in addition to reading the lockfile, so a missing/stale lockfile can't mask a live listener. Consider also: making the drain window in `reload.ts` briefly re-verify nothing else grabbed the port before an old process fully relinquishes control, and/or having `bindOnce` fail loudly (rather than silently succeeding) when it binds a port a lockfile-less-but-live process already had.

## Context

Found while diagnosing and fixing the reload-storm crash (#0271) — see that task's history for the full incident writeup. Not on the path of that original crash; this is a separate, lower-probability bug uncovered incidentally while reproducing it. Low/medium priority: requires the lockfile to already be missing/stale AND a bind attempt to land in a narrow timing window, which doesn't happen in normal operation.

## Activity

- 2026-08-24T19:31:09Z · created · unknown
- 2026-08-24T21:35:43Z · model_override
- 2026-08-24T21:35:57Z · status inbox→ready
- 2026-08-25T00:56:52Z · status ready→active, branch
- 2026-08-25T05:06:35Z · model_override
- 2026-08-25T05:32:53Z · status active→review
- 2026-08-25T05:38:50Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-08-25T05:48:37Z · model_override
- 2026-08-25T05:48:40Z · status review→active
- 2026-08-25T06:16:45Z · status active→review

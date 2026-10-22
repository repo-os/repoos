---
id: "0914"
title: "Provider usage-limit failover: detect a 429 usage-limit, pause that provider everywhere, and re-route even pinned tasks"
type: feature
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/provider-usage-limit-failover-detect-a-4
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T02:17:25Z"
updated_at: "2026-10-22T04:06:58Z"
handoff_signal_retry_count: 1
---
## Problem
2026-10-22: the opencode-go subscription hit its usage limit (429 'Go usage limit exceeded'). Every engineer on opencode-go failed instantly, dozens of times, for hours: #0910, #0909, #0904, #0908 and others made no progress while the board looked active. RepoOS only switches an engineer's model once after 3 crashes, and it refuses to switch tasks whose override is 'human-set' (pinned), which includes every override a driver sets with repoos override. Alerts exist (#0678) but nothing pauses the provider or re-routes work, and the CTO/reviewer paths that use opencode models fail the same way. A driver had to notice the pattern and run repoos agents pause by hand.

## Desired UX
When an agent run fails with a clear quota or usage-limit error (HTTP 429 or the CLI's usage-limit message), RepoOS marks that agent+model (or the whole provider) as exhausted, pauses it automatically with the reason and an optional reset time, and moves every affected task, the CTO monitor and the reviewer to the next allowed pair without human help. Pinned overrides do not block this: the task keeps a record of the original pin and returns to it when the provider is resumed. The bell and the Agents page show 'opencode-go out of usage since HH:MM' with a Resume button and the exact command.

## Acceptance criteria
- Usage-limit detection from driver output/errors (opencode 'usage limit exceeded' / 429, codex, cursor, copilot equivalents) classified separately from crashes; table-driven tests per CLI with real error strings.
- Automatic pause of the exhausted pair with the reason, and re-route of active tasks, new starts, dispatch, CTO and reviewer to the next allowed non-paused pair; pins are overridden for the duration and restored on resume (record original pin).
- Retry-after / reset time parsed when the error provides it; otherwise a periodic cheap probe attempts to resume.
- One notification (not one per crash) and a visible banner/Agents-page status; Settings control to turn auto-pause on or off, per the Settings-control rule in AGENTS.md.
- Tests: pinned task, all pairs paused, last allowed pair exhausted (clear human-needed message, no crash loop), resume restores the pin.
- Docs: user-docs and docs/debugging-check-failures.md.

## Notes for AI
Start from crash recovery in src/server/agents.ts (the 'surfaced instead of switching' path), the budget allowlist pause mechanism (repoos agents pause/resume) and the provider-failure scrape fixed in #0709. Do not weaken the 'never replace a human-set override' rule except for this exhausted-provider case.

## Activity

- 2026-10-22T02:17:25Z · created · njachowski@gmail.com
- 2026-10-22T02:28:01Z · status inbox→ready
- 2026-10-22T02:28:06Z · cli_override, model_override
- 2026-10-22T02:28:07Z · status ready→active, branch
- 2026-10-22T02:31:20Z · body
- 2026-10-22T02:33:21Z · body
- 2026-10-22T02:33:21Z · body
- 2026-10-22T02:43:21Z · message_queued at 2026-10-22T02:43:21.266Z
- 2026-10-22T02:43:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T02:44:28Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T02:49:44Z · body
- 2026-10-22T02:49:44Z · body
- 2026-10-22T02:59:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T02:59:32Z · message_delivered: 1 message(s)
- 2026-10-22T02:59:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T03:51:01Z · message_queued at 2026-10-22T03:51:01.743Z
- 2026-10-22T03:51:01Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T03:56:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T04:00:36Z · body
- 2026-10-22T04:06:58Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review

---
id: "0970"
title: "Check gate audit: record per-step timings and a timings report"
type: chore
status: done
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
debug_tldr: "Agent stopped because commit 7cbb4d0c2 dropped the repoos.toml profile settings that the profile tests need, so they fail — have the driver apply that config on main (or restore it on the branch), then re-handoff."
debug_tldr_at: "2026-10-28T13:20:20Z"
debug_tldr_key: dev-error|the agent process exited with an error — open the task to see the full output
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/check-gate-audit-record-per-step-timings
cli_override: codex
model_override: gpt-6.1-sol
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-27T14:50:38Z"
updated_at: "2026-10-28T13:20:20Z"
review_rounds: 1
review_passes: 1
last_handoff_failure_fingerprint: "check|repoos check failed: ◆ Check plan"
last_handoff_failure_sha: a7faee07a7fe0da9f4cf7aab267566da66f57e11
handoff_signal_retry_count: 2
last_check_failure: "repoos check (exit 1) at 2026-10-28T06:01:43.510Z: repoos check failed: tests — command failed (exit 1)"
dev_error_count: 1
---
## Problem
Handoff checks are slow (full local gate 10-20 min under load; one #0961 run 17 min) and RepoOS cannot say which step costs the time: `.repoos/checks.db` `check_runs` stores only total `duration_ms`, `failed_step` and counts. Of the last 1,000 runs (2026-10-20 to 2026-10-27) only 266 passed; 553 failed on remote-validation infrastructure, 92 on tests, 49 on staleness, 13 on formatting, 7 on contrast/smoke/docs. The gate has 19 steps in `repoos.toml` `[[check.steps]]`, including 610 test files, a 224-screen rendered contrast audit (16 themes x 14 states), the UI smoke test, and separate installs+builds for user-docs, landing and telegram-manager plus a macOS icon check.

## Desired UX
Every check run records how long each step took, and the handoff (pre-review) gate runs only the steps that catch real bugs for the changed code; slow, rarely-failing steps run once at close-out (Move to done), so a handoff finishes in a few minutes.

## Acceptance criteria
- [ ] Per-step timing: each check run stores every step's name, duration and outcome (new column or table in checks.db, migration included); `repoos check` prints a per-step timing summary; the Checks page shows it.
- [ ] A small report (CLI or Checks page) shows, per step over the last N runs: median and p90 duration, and how often it failed.
- [x] ~~Move slow, rarely-failing steps to close-out only via `profiles`~~ — dropped by Nick on 2026-10-28: measured on an idle machine these steps take seconds (contrast 18 s, docs 6 s, others ~1 s), and the test suite is ~95% of close-out time. The timing numbers are recorded in `docs/debugging-check-failures.md`; narrowing close-out tests moved to #0973.
- [ ] The close-out gate still runs every step; nothing is removed outright.
- [ ] Tests for the timing recording and the report; `repoos check --changed main` passes.

## Notes for AI
Change the gate by editing `[[check.steps]]` in repoos.toml (AGENTS.md "Definition of done"), not src/commands/check.ts, except for the timing recording itself. The repoos.toml step changes are explicitly authorized for this task by Nick (2026-10-27). Run only affected test files, never the full suite as a self-check. Never restart the RepoOS server, never run `repoos serve`, never request a preview.

## Shots
```json
[
{
"label": "Step timing report and successful run details",
"target": "default",
"route": "/checks?tab=runs",
"highlight": ".cr-step-report",
"steps": [
{
"click": "tr.cr-expandable"
}
],
"state": "checks:timings"
}
]
```

## Activity

- 2026-10-27T14:50:38Z · created · njachowski@gmail.com
- 2026-10-28T03:36:13Z · cli_override, model_override
- 2026-10-28T03:36:36Z · status inbox→ready
- 2026-10-28T03:37:01Z · status ready→active, branch
- 2026-10-28T03:37:47Z · message_queued at 2026-10-28T03:37:47.102Z
- 2026-10-28T03:41:48Z · body
- 2026-10-28T05:20:51Z · engineer stopped by request
- 2026-10-28T05:21:17Z · message_overdue: still queued after 60m without being delivered
- 2026-10-28T05:21:17Z · message_delivered: 1 message(s)
- 2026-10-28T05:26:40Z · body
- 2026-10-28T05:44:48Z · message_queued at 2026-10-28T05:44:48.000Z
- 2026-10-28T05:45:00Z · title
- 2026-10-28T06:01:43Z · message_delivered: 1 message(s)
- 2026-10-28T08:01:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T08:06:37Z · message_queued at 2026-10-28T08:06:37.627Z
- 2026-10-28T08:11:51Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-28T08:11:51Z · note: handoff requested (cli)
- 2026-10-28T08:50:19Z · handoff failed · task-file handoff failed at check · repoos check failed: ◆ Check plan
- 2026-10-28T08:50:44Z · message_queued at 2026-10-28T08:50:44.383Z
- 2026-10-28T09:03:50Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T09:03:50Z · message_delivered: 2 message(s)
- 2026-10-28T09:04:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T09:17:22Z · note: handoff requested (ui-review)
- 2026-10-28T09:18:03Z · handoff failed · ui-review handoff failed at validate · unexpected error: git worker git-command timed out after 9000ms
- 2026-10-28T09:26:21Z · note: handoff requested (ui-review)
- 2026-10-28T09:33:19Z · handoff failed · ui-review handoff failed at validate · unexpected error: git worker git-overview waited 180000ms in the queue without starting
- 2026-10-28T11:23:55Z · note: handoff requested (ui-review)
<<<<<<< HEAD
- 2026-10-28T11:51:10Z · handoff failed · ui-review handoff failed at check · repoos check failed: ◆ Check plan
- 2026-10-28T11:51:36Z · note: handoff requested (ui-review)
- 2026-10-28T12:17:17Z · status active→review
- 2026-10-28T12:17:32Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (1baa712e1) during finalization (#0734)
- 2026-10-28T12:17:35Z · note: review pass 1: failed — no usable report
- 2026-10-28T12:17:35Z · needs_input
- 2026-10-28T12:25:04Z · review_cli_override, review_model_override
- 2026-10-28T12:25:06Z · review_model_override
- 2026-10-28T12:25:07Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-10-28T12:26:35Z · note: review pass 2: needs some work
- 2026-10-28T12:26:37Z · status review→active
- 2026-10-28T12:27:20Z · body: Acceptance criteria (added 1, removed 1)
- 2026-10-28T12:27:20Z · message_queued at 2026-10-28T12:27:20.367Z
- 2026-10-28T12:27:33Z · title
=======
- 2026-10-28T12:17:17Z · status active→review
>>>>>>> feat/check-gate-audit-record-per-step-timings
- 2026-10-28T12:27:43Z · message_queued at 2026-10-28T12:27:43.231Z
- 2026-10-28T12:27:43Z · status review→active
- 2026-10-28T12:27:48Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (1baa712e1) during finalization (#0734)
- 2026-10-28T12:28:19Z · handoff failed · task-file handoff failed at commit · no implementation found since the branch diverged; use no_source_change: true to force a no-op handoff
- 2026-10-28T12:33:20Z · watchdog: auto-surfaced stuck task · status active→ready · agent crashed or was interrupted mid-turn — task-file handoff failed at check · repoos check failed: ◆ Check plan · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-28T12:40:39Z · status ready→done
- 2026-10-28T13:19:41Z · agent exited with an error · the agent process exited with an error — open the task to see the full output

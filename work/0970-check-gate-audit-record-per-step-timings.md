---
id: "0970"
title: "Check gate: per-step/test timings; close-out runs changed + high-risk tests, full suite at release"
type: chore
status: review
needs_input: true
needs_input_reason: review-failed
needs_input_detail: "the opencode agent exited without output: error: Go usage limit exceeded"
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/check-gate-audit-record-per-step-timings
cli_override: codex
model_override: gpt-6.1-sol
created_at: "2026-10-27T14:50:38Z"
updated_at: "2026-10-28T12:17:35Z"
handoff_signal_retry_count: 2
last_check_failure: "repoos check (exit 1) at 2026-10-28T06:01:43.510Z: repoos check failed: tests — command failed (exit 1)"
---
## Problem
Handoff checks are slow (full local gate 10-20 min under load; one #0961 run 17 min) and RepoOS cannot say which step costs the time: `.repoos/checks.db` `check_runs` stores only total `duration_ms`, `failed_step` and counts. Of the last 1,000 runs (2026-10-20 to 2026-10-27) only 266 passed; 553 failed on remote-validation infrastructure, 92 on tests, 49 on staleness, 13 on formatting, 7 on contrast/smoke/docs. The gate has 19 steps in `repoos.toml` `[[check.steps]]`, including 610 test files, a 224-screen rendered contrast audit (16 themes x 14 states), the UI smoke test, and separate installs+builds for user-docs, landing and telegram-manager plus a macOS icon check.

## Desired UX
Every check run records how long each step took, and the handoff (pre-review) gate runs only the steps that catch real bugs for the changed code; slow, rarely-failing steps run once at close-out (Move to done), so a handoff finishes in a few minutes.

## Acceptance criteria
- [ ] Per-step timing: each check run stores every step's name, duration and outcome (new column or table in checks.db, migration included); `repoos check` prints a per-step timing summary; the Checks page shows it.
- [ ] A small report (CLI or Checks page) shows, per step over the last N runs: median and p90 duration, and how often it failed.
- [ ] Using real numbers from that report, move slow, rarely-failing steps to the close-out profile only via `profiles` in `repoos.toml` (candidates: rendered-contrast, user-docs-build, landing-build, telegram-manager-build/test, macos-hub-icon-transparency), and make the path-scoped ones `whenChanged` so they skip when their folders are untouched. Record the before/after numbers in `docs/debugging-check-failures.md` or a new doc.
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
- 2026-10-28T11:51:10Z · handoff failed · ui-review handoff failed at check · repoos check failed: ◆ Check plan
- 2026-10-28T11:51:36Z · note: handoff requested (ui-review)
- 2026-10-28T12:17:17Z · status active→review
- 2026-10-28T12:17:32Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (1baa712e1) during finalization (#0734)
- 2026-10-28T12:17:35Z · note: review pass 1: failed — no usable report
- 2026-10-28T12:17:35Z · needs_input

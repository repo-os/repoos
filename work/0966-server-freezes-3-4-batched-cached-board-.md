---
id: "0966"
title: "Server freezes (3/4): batched, cached board git queries"
type: refactor
status: active
needs_input: true
needs_input_reason: check-wait
needs_input_detail: "waiting: system load is high (3.7× per CPU, limit 3×) — waiting for headroom before starting more work; additional signals: macOS memory_pressure reports warn (advisory); memory compressor is holding 38% of RAM (9.1 GB of RAM) — not holding on occupancy alone for 10m"
hold: true
hold_reason: "Driver landing by hand (Nick, 2026-10-29)"
hold_by: driver
hold_at: "2026-10-29T11:44:15.248Z"
priority: p1
area: core
depends_on: ["0962"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/server-freezes-3-4-batched-cached-board-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-27T12:02:34Z"
updated_at: "2026-10-29T11:44:15Z"
handoff_signal_retry_count: 2
dev_error_count: 6
engineer_stall_resume_log: "[{\"at\":\"2026-10-29T08:56:47.889Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
Split from #0962. The board computes git state per task/branch (ahead counts, merged checks, work-file history), spawning hundreds of git processes on ~900 tasks and ~100 branches.

## Desired UX
Board git state comes from a handful of batched, cached queries, so the board stays fast however many tasks and branches exist.

## Acceptance criteria
- [ ] Board git reads use: one `for-each-ref` with `%(ahead-behind:main)` and objectname, one `branch --merged main`, one incremental `log --name-only -- work`, one `worktree list --porcelain`.
- [ ] Caches invalidate on ref/HEAD change, not on a timer; per-task/per-branch spawns are removed.
- [ ] UI-polled GET routes (Control worktree-gc, /api/tasks, deployments) never trigger a full index rebuild.
- [ ] Tests with a fake git runner prove the spawn count stays constant as tasks/branches grow.

## Notes for AI
Depends on #0962. Same rules as the other split tasks: no server restarts, no previews, no repoos.toml edits, run only affected tests.

## Activity

- 2026-10-27T12:02:34Z · created · njachowski@gmail.com
- 2026-10-28T18:25:05Z · cli_override, model_override
- 2026-10-28T18:25:28Z · status inbox→ready
- 2026-10-28T18:25:38Z · status ready→active, branch
- 2026-10-28T18:26:59Z · message_queued at 2026-10-28T18:26:59.158Z
- 2026-10-28T18:28:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T18:29:04Z · message_delivered: 1 message(s)
- 2026-10-28T18:29:20Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T18:34:45Z · message_queued at 2026-10-28T18:34:45.344Z
- 2026-10-28T18:39:57Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-28T19:04:48Z · message_delivered: 1 message(s)
- 2026-10-29T04:29:30Z · status ready→active
- 2026-10-29T04:33:18Z · message_queued at 2026-10-29T04:33:18.916Z
- 2026-10-29T05:43:49Z · message_overdue: still queued after 60m without being delivered
- 2026-10-29T05:44:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T05:44:48Z · message_delivered: 1 message(s)
- 2026-10-29T05:51:00Z · agent exited with an error (codex) · 2026-10-29T05:51:00.122235Z ERROR codex_core::session: failed to record rollout items: thread 01a183c5-418c-7f12-8fd8-474ebb286d77 not found
- 2026-10-29T05:51:00Z · engineer crash recovery: resuming codex + gpt-6.1-sol (1/3 crashes in 30m) · 2026-10-29T05:51:00.122235Z ERROR codex_core::session: failed to record rollout items: thread 01a183c5-418c-7f12-8fd8-474ebb286d77 not found
- 2026-10-29T05:51:11Z · engineer crash recovery: resuming codex + gpt-6.1-sol (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-29T05:51:21Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6.1-sol) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-29T08:11:00Z · model_override
- 2026-10-29T08:11:27Z · needs_input
- 2026-10-29T08:12:49Z · agent exited with an error (codex) · 2026-10-29T08:12:32.353699Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)")))
- 2026-10-29T08:12:49Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-10-29T08:12:32.353699Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)…
- 2026-10-29T08:13:15Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · 2026-10-29T08:13:03.471327Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)…
- 2026-10-29T08:13:43Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-29T08:16:51Z · needs_input
- 2026-10-29T08:51:43Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T08:56:47Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-29T10:18:01Z · watchdog: check wait escalated · waiting: system load is high (3.7× per CPU, limit 3×) — waiting for headroom before starting more work; additional signals: macOS memory_pressure reports warn (advisory); memory compressor is holding 38% of RAM (9.1 GB of RAM) — not holding on occupancy alone for 10m · next step: let it finish — the wait clears itself when the check starts running; investigate only if it persists
- 2026-10-29T10:37:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T11:44:15Z · held, held-reason, held-by, held-at

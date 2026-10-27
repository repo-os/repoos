---
id: "0962"
title: "Server freezes: move all git reads off the HTTP thread, batch and cache them"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_merge: true
priority: p0
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/server-freezes-move-all-git-reads-off-th
cli_override: codex
model_override: gpt-6.1-sol
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-26T07:54:06Z"
updated_at: "2026-10-27T20:23:29Z"
last_handoff_failure_fingerprint: check|server-side finalization timed out (deadline exceeded)
last_handoff_failure_sha: bedc55741a9e477fc772b91b48c18f324b8204c0
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
dev_error_count: 10
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\"}"
---
## Problem
The RepoOS server (single Bun main thread) repeatedly freezes or becomes unusably slow (UI never loads, accepts then resets connections) because it runs blocking git child processes per task/branch on the same thread that serves HTTP. With ~910 tasks, ~100 branches, 27 worktrees, each spawn costs 0.1-0.3 s on macOS (syspolicyd). Fixed one loop at a time so far (live-index per-file git, dir-log walk cache, async ahead-count cache, GET /api/system/worktree-gc preview cache) but others remain: worktreeStatus() callers (task-watchdog.ts, indexer.ts), per-task `git rev-list --count`, per-branch `merge-base --is-ancestor` (worktree-gc.ts, task-dependencies.ts, worktree-handoff-guard.ts, done.ts), sync `git log --name-only -- work` walks (indexer.ts:76, story-definition-files.ts).

## Desired UX
The UI loads in under a second and stays responsive no matter how many tasks/branches/engineers exist. A slow git call can delay only the answer that needs it.

## Acceptance criteria
Narrowed on 2026-10-27 to what this branch already does (1/4 of the server-freeze work); the rest moved to #0965 (remaining sync git spawns + guard), #0966 (batched cached board queries), #0967 (request timing / STUCK log), #0969 (1 h latency measurement). #0968 covers the auto-reload handover bug.

- [ ] Git work runs in a worker with a request queue and a per-call timeout; the HTTP thread never awaits a spawn inline for the call sites this branch moved.
- [ ] GET /api/tasks is paged so the board no longer builds every task's enrichment per request.
- [ ] The three regressions found on 2026-10-27 are fixed: agent-drivers "crush driver captures the session id", agent-review "reviews again after a human returns a task", agent-review "rejects move-to-done while automatic review is still running". They pass on main, so they must pass here without weakening the tests.
- [ ] Run only the affected test files plus `repoos check --changed main` (no full-suite run: one took 80 min and swamped the machine).

## Notes for AI
Read HANDOFF-2026-10-25.md in the repo root first (evidence, hypotheses, file/line suspects). Do not restart the server yourself; ask the human. Never run `just serve-noauth` or request previews while editing server git code.

## Sub-item: replace the GET /api/tasks "dump everything" endpoint
`GET /api/tasks` returns all ~910 tasks with full markdown bodies plus per-task enrichers (dependency blockers, review status, preview targets, checkpoint recovery, pending handoff). It is a synchronous handler, so it blocks the whole server for ~45 s (was 60+ s before dependency-state caching, adfa259c9). No UI code calls it (the UI uses /api/board; only POST /api/tasks is used); the route is only listed in src/cli/api-route-parity.ts, so callers are external scripts/agents. It does not scale (grows with every task ever filed) and nobody needs 900 bodies as context.
Build, and keep CLI/API parity per AGENTS.md:
1. `GET /api/tasks/:id/context`: the task, its dependencies and dependents, related tasks (same story/area, recent neighbours) as short summaries, latest review verdict, branch/worktree status. This is what engineer/PM agents need.
2. `GET /api/tasks?fields=id,title,status,priority&status=...&limit=...&cursor=...`: a light, filterable, paged list without bodies; make `repoos list` and similar commands use it.
3. Keep the full dump only behind `?full=1`, made async/chunked so it cannot block the HTTP thread; add a test that fails if the default response grows with body size.
Acceptance: default list <200 ms warm with 900 tasks; context endpoint <100 ms; no per-task sync git in either.

## Activity

- 2026-10-26T07:54:06Z · created · njachowski@gmail.com
- 2026-10-26T07:54:12Z · needs_input
- 2026-10-26T07:54:21Z · body: Problem (added 1, removed 1); Desired UX (added 1, removed 1); Acceptance criteria (added 7, removed 1); Notes for AI (added 1, removed 1)
- 2026-10-26T08:49:23Z · needs_input
- 2026-10-26T09:21:57Z · body: Sub-item: replace the GET /api/tasks "dump everything" endpoint (added)
- 2026-10-26T09:27:53Z · released
- 2026-10-26T09:28:10Z · status inbox→active
- 2026-10-26T09:28:17Z · cli_override, model_override
- 2026-10-26T09:28:17Z · branch
- 2026-10-26T09:28:30Z · message_queued at 2026-10-26T09:28:30.887Z
- 2026-10-26T09:28:41Z · agent exited with an error (codex) · 2026-10-26T09:28:35.512993Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-26T09:28:41Z · engineer crash recovery: resuming codex + gpt-6.1-sol (1/3 crashes in 30m) · 2026-10-26T09:28:35.512993Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-26T09:28:44Z · message_delivered: 1 message(s)
- 2026-10-26T09:28:59Z · engineer crash recovery: resuming codex + gpt-6.1-sol (2/3 crashes in 30m) · 2026-10-26T09:28:49.831801Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-26T09:29:08Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6.1-sol) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-26T10:04:52Z · cli_override, model_override
- 2026-10-26T10:04:57Z · needs_input
- 2026-10-26T10:04:58Z · message_queued at 2026-10-26T10:04:58.089Z
- 2026-10-26T10:05:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-26T10:56:54Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-26T11:14:37Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T11:14:38Z · message_queued at 2026-10-26T11:14:38.107Z
- 2026-10-26T11:33:32Z · agent exited with an error (opencode) · error: Go usage limit exceeded
- 2026-10-26T11:33:32Z · engineer crash recovery: switched opencode + opencode-go/kimi-k3.1-pro → opencode + opencode-go/deepseek-v4.1-flash after 1/3 crashes in 30m · error: Go usage limit exceeded
- 2026-10-26T11:33:35Z · message_delivered: 2 message(s)
- 2026-10-26T11:33:36Z · message_queued at 2026-10-26T11:33:36.352Z
- 2026-10-26T11:38:49Z · cli_override, model_override
- 2026-10-26T11:38:51Z · cli_override
- 2026-10-26T11:38:55Z · cli_override
- 2026-10-26T11:38:57Z · model_override
- 2026-10-26T12:32:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-26T12:35:13Z · cli_override, model_override
- 2026-10-26T12:36:33Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T12:41:09Z · body
- 2026-10-26T12:47:27Z · body
- 2026-10-26T14:00:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-26T14:01:00Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T14:10:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T14:25:12Z · needs_input
- 2026-10-26T14:25:20Z · held
- 2026-10-26T14:25:26Z · assigned_to
- 2026-10-26T14:25:39Z · status active→ready
- 2026-10-26T14:44:17Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T14:53:31Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T15:31:01Z · cli_override, model_override
- 2026-10-26T18:50:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T18:50:15Z · released, assigned_to
- 2026-10-26T18:50:38Z · status ready→active
- 2026-10-26T18:50:45Z · cli_override, model_override
- 2026-10-26T18:50:50Z · message_delivered: 1 message(s)
- 2026-10-26T18:50:50Z · message_queued at 2026-10-26T18:50:50.681Z
- 2026-10-26T18:55:01Z · body
- 2026-10-26T18:57:30Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-26T18:57:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-26T18:57:31Z · message_delivered: 1 message(s)
- 2026-10-26T18:58:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-26T19:02:23Z · note: handoff requested (ui-review)
- 2026-10-26T19:14:27Z · status active→review
- 2026-10-26T19:14:30Z · note: shots: skipped — the diff (16 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-26T19:15:58Z · note: review pass 1: good to go
- 2026-10-26T19:30:11Z · needs_merge
- 2026-10-26T19:31:05Z · status review→active
- 2026-10-26T19:41:26Z · note: handoff requested (ui-review)
- 2026-10-26T19:51:29Z · message_queued at 2026-10-26T19:51:29.675Z
- 2026-10-26T19:57:02Z · handoff failed · ui-review handoff failed at check · repoos check failed: tests — timed out — timed out after 420s
- 2026-10-26T19:57:02Z · message_delivered: 1 message(s)
- 2026-10-26T20:10:33Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-26T20:10:33Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-26T20:19:02Z · body
- 2026-10-26T20:21:30Z · needs_input
- 2026-10-26T20:21:31Z · needs_input
- 2026-10-26T20:30:41Z · status active→review
- 2026-10-26T20:30:41Z · note: shots: skipped — the diff (16 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-26T20:32:01Z · note: review pass 2: needs some work
- 2026-10-26T20:32:02Z · status review→active
- 2026-10-26T20:53:31Z · body
- 2026-10-26T20:57:15Z · body
- 2026-10-26T21:10:40Z · handoff failed · remote validation failed: test failure: tests/input-story-delete-routes.test.ts > DELETE /api/inputs/:id > removes the input file and its attachments, tests/input-story-delete-routes.test.ts > DELETE /api/stories/:key > removes the definition file, emits definitionsChanged, leaves tasks alone on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-26T21:14:55Z · cli_override, model_override
- 2026-10-26T21:14:58Z · model_override
- 2026-10-27T01:00:26Z · cli_override, model_override
- 2026-10-27T02:31:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-27T02:31:47Z · needs_input
- 2026-10-27T02:31:48Z · status active→review, needs_input
- 2026-10-27T02:31:48Z · note: handoff requested (cli)
- 2026-10-27T02:42:29Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/agent-drivers.test.ts > crush driver > captures the session id by before/after diff and ingests usage from session show, tests/agent-review.test.ts > agent review before human sign-off (#0101) > rejects move-to-done while automatic review is still running without cancelling it, tests/areas-settings.test.ts > area-vocabulary drift advisory (#0587) > fires on a raw repoos.toml edit, not just a curated PATCH on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-27T03:24:15Z · review_cli_override
- 2026-10-27T03:38:24Z · cli_override, model_override
- 2026-10-27T04:00:45Z · engineer stopped by request
- 2026-10-27T04:00:45Z · needs_input
- 2026-10-27T04:00:46Z · status active→review, needs_input
- 2026-10-27T04:00:46Z · note: handoff requested (cli)
- 2026-10-27T04:34:07Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-27T05:51:59Z · needs_input
- 2026-10-27T05:52:00Z · message_queued at 2026-10-27T05:52:00.119Z
- 2026-10-27T05:56:13Z · body
- 2026-10-27T06:01:18Z · note: AC6 live evidence remains unverified: the one-hour run with 900 tasks/100 branches and two engineers needs a human-controlled server rollout. Please split that measurement into a held human task; no server restart or preview was started. The worktree audit also found transitive blocking helpers beyond the current text guard; see docs/server-git-worker.md. Task remains active; no handoff requested.
- 2026-10-27T06:08:15Z · body
- 2026-10-27T06:11:42Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-27T06:11:43Z · needs_input
- 2026-10-27T06:11:43Z · message_delivered: 1 message(s)
- 2026-10-27T06:41:12Z · review_cli_override, review_model_override
- 2026-10-27T06:41:31Z · engineer crash recovery: resuming codex + gpt-6.1-sol (1/3 crashes in 30m) · error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 3:38 PM.
- 2026-10-27T06:41:43Z · engineer crash recovery: resuming codex + gpt-6.1-sol (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-27T06:43:24Z · engineer crash recovery: resuming codex + gpt-6.1-sol (3/12 crashes in 30m) · 2026-10-27T06:41:51.886191Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-27T06:43:34Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6.1-sol) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-10-27T09:07:23Z · needs_input
- 2026-10-27T09:07:23Z · message_queued at 2026-10-27T09:07:23.457Z
- 2026-10-27T09:08:34Z · agent exited with an error (codex) · 2026-10-27T09:07:28.467328Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-27T09:09:04Z · engineer crash recovery: resuming codex + gpt-6.1-sol (1/12 crashes in 30m) · 2026-10-27T09:07:28.467328Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-27T09:09:08Z · message_delivered: 1 message(s)
- 2026-10-27T10:27:29Z · engineer stopped by request
- 2026-10-27T10:27:29Z · needs_input
- 2026-10-27T10:27:43Z · needs_input
- 2026-10-27T12:03:43Z · body: Acceptance criteria (added 5, removed 7)
- 2026-10-27T12:04:04Z · needs_input
- 2026-10-27T12:04:04Z · message_queued at 2026-10-27T12:04:04.939Z
- 2026-10-27T13:16:17Z · message_overdue: still queued after 60m without being delivered
- 2026-10-27T13:16:30Z · note: Narrowed-scope implementation and three reported async lifecycle regressions are fixed. Affected-file run: 280 passed, 1 skipped, with one worker stream fixture failure subsequently corrected and its 7 lifecycle tests passing unchanged in intent. Worktree clean after RepoOS self-check checkpoint 9a40b2aa1. Handoff blocked: normal scoped check refused because control-plane remote validation is disabled; supported --local-tests fallback with REPOOS_CHECK_CHANGED=main selected 429 test files and timed out at the configured 900s test limit (no failing assertion reported in that run). Staleness, formatting, lint, build, source guards, rendered contrast and UI smoke passed. No new full-suite run was started after scope was narrowed. Need remote validation enabled or the configured scoped gate made runnable; no handoff requested.
- 2026-10-27T13:16:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-27T13:16:38Z · message_delivered: 1 message(s)
- 2026-10-27T13:17:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-27T13:17:36Z · needs_input
- 2026-10-27T14:11:04Z · needs_input
- 2026-10-27T14:11:04Z · message_queued at 2026-10-27T14:11:04.932Z
- 2026-10-27T14:20:32Z · engineer stopped by request
- 2026-10-27T14:20:37Z · needs_input
- 2026-10-27T20:23:15Z · review_cli_override, review_model_override
- 2026-10-27T20:23:26Z · message_overdue: still queued after 60m without being delivered
- 2026-10-27T20:23:29Z · message_delivered: 1 message(s)

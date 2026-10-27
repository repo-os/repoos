---
id: "0960"
title: "Task hold: one durable, documented state that makes a task inert for ALL automation (repoos hold / unhold)"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-hold-one-durable-documented-state-t
cli_override: opencode
model_override: opencode-go/kimi-k3.1-pro
review_cli_override: codex
review_model_override: gpt-6.1-sol
created_at: "2026-10-25T14:23:48Z"
updated_at: "2026-10-27T07:23:36Z"
review_rounds: 2
review_passes: 2
dev_error_count: 2
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/hy3\",\"at\":\"2026-10-27T04:49:39.384Z\",\"kind\":\"dev-error\"}]"
---
## Problem

There is no single, documented way to make a task inert for ALL automation. To keep four tasks quiet during a machine-overload incident (2026-10-25) the driver had to combine four separate things: `repoos pause <id>` (stops only the running engineer), `--hold true` (today: only keeps the task out of auto-dispatch), moving it back to `ready`, and `--assigned-to human` (which means "waiting on a person", a different concept). `pause` alone is not durable: the CTO monitor ran `restart-stalled-agent` on two paused active tasks about 15 minutes later and put the engineers back, undoing the pause and the load relief. Nobody can tell from the board whether a task is quiet on purpose.

## Desired UX

One explicit state, named **hold**, meaning "a person deliberately parked this; no automation touches it". The word hold is chosen on purpose: pause can mean many things (stop the current run, a stalled run, an interrupted run), hold is always intentional.

1. `hold` is durable and honored by EVERY automation: auto-dispatch / auto-engineering, the CTO monitor (restart-stalled-agent, nudges, escalations), the watchdog's auto-resume, engineer crash recovery, auto-handoff requests, and queued-message delivery that would start an engineer. A held task never gets an engineer started by anything except an explicit human/driver command that clears the hold.
2. Commands: `repoos hold <id> --reason "<text>" [--until <date>]` (stops the running engineer if any, sets the hold with its reason, records who and when) and `repoos unhold <id>` (clears the hold; optionally `--start` to start the engineer). The API route is registered in the CLI/API parity catalog.
3. `repoos pause <id>` keeps its narrow meaning (stop the current engineer run) and its help text says so and points to `repoos hold` for "keep quiet".
4. Visible everywhere: a "Held" badge with the reason on the board card and in the task drawer (inside the single status area from #0952's design if it has landed), a Held filter or group, a line listing held tasks with reasons in `repoos driver brief`, and held tasks do not count toward `maxActiveTasks`.
5. Existing `hold: true` tasks (for example the human-gated ones) keep working; they simply become fully inert for the CTO/watchdog too, which is what the flag was always understood to mean. Document that in the migration note. No new status column and no task-format migration.

## Acceptance criteria

- [ ] A held task is skipped by auto-dispatch, the CTO monitor, the watchdog auto-resume, crash recovery and auto-handoff, each proven by a test that fails without the check.
- [ ] `repoos hold` / `repoos unhold` exist with `--reason`, `--until` (auto-release when the date passes, shown in the badge), CLI/API parity entry, user-docs/cli.md and AGENTS.md ("Driving the board") updated.
- [ ] UI badge, filter, drawer reason, driver-brief line, and the `maxActiveTasks` exemption, each with a test; Settings copy where a setting is involved.
- [ ] `repoos pause` help text updated; tests unchanged in behavior.
- [ ] A manual `repoos start <id>` on a held task refuses with a clear message naming the reason, unless `--force` or after `unhold`.
- [ ] Run every test touching the CTO monitor, watchdog, crash recovery, dispatch and the task drawer in small groups, then `repoos check --changed main`.

## Notes for AI

- This touches central automation (CTO, watchdog, crash recovery, dispatch). It is deliberately a normal task with review, not a hotfix on main: a bug here silently skips tasks that should run.
- Do not start a second RepoOS server from a worktree (see #0954).

## Activity

- 2026-10-25T14:23:48Z · created · njachowski@gmail.com
- 2026-10-26T18:53:55Z · status inbox→ready
- 2026-10-26T21:39:24Z · cli_override
- 2026-10-26T21:39:30Z · cli_override
- 2026-10-26T21:39:33Z · model_override
- 2026-10-26T21:39:45Z · model_override
- 2026-10-26T21:39:47Z · status ready→active, branch
- 2026-10-27T00:32:28Z · body
- 2026-10-27T00:46:00Z · handoff failed · remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist, tests/cli-control-api.test.ts > control API CLI > agents pause/resume writes the allowlist config (#0850), tests/refresh-evidence-route.test.ts > POST /api/tasks/:id/verify guards > refuses engineer start while evidence refresh is in progress on mini — fix it in the feature branch and re-run the gate
- 2026-10-27T00:51:03Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist, tests/cli-control-api.test.ts > control API CLI > agents pause/resume writes the allowlist config (#0850), tests/refresh-evidence-route.test.ts > POST /api/tasks/:id/verify guards > refuses engineer start while evidence refresh is in progress on mini — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-27T00:51:03Z · note: handoff requested (cli)
- 2026-10-27T01:06:29Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist, tests/cli-control-api.test.ts > control API CLI > agents pause/resume writes the allowlist config (#0850), tests/refresh-evidence-route.test.ts > POST /api/tasks/:id/verify guards > refuses engineer start while evidence refresh is in progress on bee — fix it in the feature branch and re-run the gate
- 2026-10-27T03:02:38Z · review_cli_override, review_model_override
- 2026-10-27T03:02:48Z · note: handoff requested (ui-review)
- 2026-10-27T03:02:50Z · status active→review
- 2026-10-27T03:02:50Z · note: review without checks by hello@repoos.org
- 2026-10-27T03:06:50Z · note: review pass 1: needs some work
- 2026-10-27T03:06:50Z · status review→active
- 2026-10-27T04:49:39Z · agent exited with an error (opencode) · network problem reaching the model provider, not a code issue: Timed out waiting for response headers
- 2026-10-27T04:49:39Z · engineer crash recovery: resuming opencode + opencode-go/hy3 (1/3 crashes in 30m) · network problem reaching the model provider, not a code issue: Timed out waiting for response headers
- 2026-10-27T05:46:02Z · body
- 2026-10-27T05:50:43Z · body
- 2026-10-27T06:06:15Z · status active→review
- 2026-10-27T06:19:04Z · note: review pass 2: needs some work
- 2026-10-27T06:19:04Z · message_queued at 2026-10-27T06:19:04.635Z
- 2026-10-27T06:19:04Z · status review→active
- 2026-10-27T06:22:00Z · handoff failed · remote validation failed: test failure: tests/cli-control-api.test.ts > control API CLI > agents pause/resume writes the allowlist config (#0850), tests/refresh-evidence-route.test.ts > POST /api/tasks/:id/verify guards > refuses engineer start while evidence refresh is in progress, tests/refresh-evidence-route.test.ts > automatic stale-evidence refresh serialization (#0772) > blocks an engineer start while the automatic refresh holds the lock on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-27T06:25:56Z · message_delivered: 1 message(s)
- 2026-10-27T06:25:56Z · needs_input
- 2026-10-27T06:25:57Z · message_queued at 2026-10-27T06:25:57.295Z
- 2026-10-27T06:26:28Z · review_cli_override, review_model_override
- 2026-10-27T06:40:54Z · cli_override, model_override
- 2026-10-27T07:01:49Z · cli_override, model_override
- 2026-10-27T07:14:32Z · body
- 2026-10-27T07:20:36Z · body
- 2026-10-27T07:23:34Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output

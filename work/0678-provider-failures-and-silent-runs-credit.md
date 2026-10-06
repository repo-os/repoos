---
id: "0678"
title: "Provider failures and silent runs: credit/402 alerts, degenerate-output detection, sleep-aware watchdog"
type: feature
status: active
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/provider-failures-and-silent-runs-credit
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:38Z"
updated_at: "2026-10-06T04:36:50Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-06T03:55:55.263Z: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal"
---
## Problem

- OpenRouter credit ran out mid-run (HTTP 402 `insufficient credits`); engineer sessions simply died and the board gave no alert.
- On heavier tasks DeepSeek via opencode+DeepInfra produced two new failure modes: a run that ended in a runaway loop of `<` tokens (1.4 MB log) and an agent looping on "I'll call the shell tool now ... emitting" without ever calling it; also a request that went silent for 10+ min.
- An agent looked hung for 32 min (log silent; the staleness watchdog did not flag it). The owner's laptop may have been asleep: unknown whether the watchdog counts sleep as a stall.

## Desired UX

- Provider errors (402/credit, auth, rate limit, model unavailable) become a visible notice and a `needs input` reason, not a dead session.
- Detect repetition/degenerate output (same token or line repeated beyond a threshold, or log growth with no tool calls) and stop and retry once, then raise a notice.
- The watchdog compares process liveness and output against awake time (ignore system sleep) and auto-restarts or surfaces a silent run.

## Acceptance criteria

- Tests with stub agents: 402 output -> notice; repeated-token output -> run stopped and flagged; silent run -> flagged after the configured idle time; a simulated sleep gap does not trigger a false stall.
- `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T16:58:38Z · created · unknown
- 2026-10-05T17:16:50Z · story
- 2026-10-05T17:16:51Z · body: section Story context
- 2026-10-06T02:44:25Z · status inbox→ready
- 2026-10-06T02:44:28Z · cli_override, model_override
- 2026-10-06T02:44:29Z · status ready→active, branch
- 2026-10-06T02:59:35Z · body
- 2026-10-06T03:07:16Z · handoff failed · remote validation failed: remote validation failed (exit 1) —     212|   expect(res.status).toBe(202);
       |                      ^
    213|   expect(res.body.status).toBe("active");
    214|   const deadline = Date.now() + 30_000;
 ❯ tests/agent-review.test.ts:349:13
 ❯ withServer tests/agent-review.test.ts:279:11
 ❯ tests/agent-review.test.ts:341:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 415 passed | 1 skipped (417)
      Tests  1 failed | 5031 passed | 15 skipped (5047)
   Start at  03:02:46
   Duration  266.06s (transform 6.44s, setup 2.42s, import 49.06s, tests 212.11s, environment 241.60s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 407ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  03:07:13
   Duration  2.29s (transform 1.05s, setup 12ms, import 1.30s, tests 407ms, environment 489ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-06T03:13:03Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —     212|   expect(res.status).toBe(202); · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T03:13:04Z · status review→active
- 2026-10-06T03:18:16Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —     212|   expect(res.status).toBe(202); · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T03:18:16Z · status review→active
- 2026-10-06T03:23:58Z · note: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T03:23:58Z · handoff failed · task-file handoff failed at verify · ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T03:29:16Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —     212|   expect(res.status).toBe(202); · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T03:29:16Z · status review→active
- 2026-10-06T03:29:48Z · note: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T03:29:48Z · handoff failed · task-file handoff failed at verify · ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T03:34:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-06T03:54:02Z · body
- 2026-10-06T03:55:52Z · note: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T04:25:16Z · body
- 2026-10-06T04:36:50Z · body

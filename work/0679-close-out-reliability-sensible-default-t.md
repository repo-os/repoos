---
id: "0679"
title: "Close-out reliability: sensible default timeout, and hand merge/semantic conflicts back to the engineer automatically"
type: feature
status: active
needs_input: true
needs_input_reason: provider-failure
needs_input_detail: "{\"type\":\"tool_call\",\"subtype\":\"started\",\"call_id\":\"tool_14bacaca-6e04-4025-a8d7-77e9663c806\",\"tool_call\":{\"shellToolCall\":{\"args\":{\"command\":\"cd /Users/nick/code/nick/repoos-worktrees/feat/close-out-reliability-sensible-default-t && git status && git stash list\",\"workingDirectory\":\"\",\"timeout\":30000,\"toolCallId\":\"tool_14bacaca-6e04-4025-a8d7-77e9663c806\",\"simpleCommands\":[\"cd\",\"git\",\"git\"],\"hasInputRedirect\":false,\"hasOutputRedirect\":false,\"parsingResult\":{\"parsingFailed\":false,\"executableComman"
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/close-out-reliability-sensible-default-t
cli_override: cursor
model_override: gpt-5.3-codex-high
created_at: "2026-10-05T16:58:40Z"
updated_at: "2026-10-06T07:18:58Z"
last_handoff_failure_fingerprint: check|server-side finalization timed out (deadline exceeded)
last_handoff_failure_sha: 404c1109cf8aa78b7446c56733747d534bb744ae
merge_conflict_retry_count: 2
review_passes: 2
handoff_signal_retry_count: 1
last_check_failure: "repoos check at 2026-10-06T03:42:59.088Z: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal"
dev_error_count: 8
---
## Problem

- Default `closeOut.timeoutMs` is 6 minutes; for a small 3-package Bun monorepo on a laptop also running agents the gate took longer under load (typecheck alone 266 s at load average ~190), so Move to done failed "timed out ... retry when the runner is less loaded". The budget is wall-clock, so a closed lid or lost Wi-Fi counts too (a job spent 19 min wall clock on a 6 min budget).
- Two parallel tasks touching a shared file (`App.vue`, `bun.lock`) conflict at close-out; RepoOS retries twice, records "handoff failed - merge conflict unresolved" and leaves the task in `review` with nobody assigned.
- A SEMANTIC conflict (task A renames a shared test helper; task B cut earlier adds callers) merges clean and fails the gate with `X is not a function`; the engineer gets nothing useful.
- Sending a follow-up message to a task in `review` leaves it in `review`: the engineer fixes things and requests handoff, nothing commits it, and Move to done refuses (dirty worktree).

## Desired UX

- Default timeout scales from the last successful gate duration (e.g. 3x, minimum 10 min) and ignores system sleep; show gate duration in the task.
- On a merge conflict or a gate failure of a branch that passed its own check, automatically move the task back to `active` and message the engineer with the conflict list/failing output and the instruction "merge main, resolve, re-run, hand off". Lockfile conflicts are resolved by regenerating.
- A message to a task in `review` moves it to `active` (or is rejected with an instruction to do so).

## Acceptance criteria

- Tests for each scenario above; docs/close-out-pipeline.md updated. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Driver feedback (round 3): merge conflict again
Close-out failed twice with 'merge conflict in src/server/server.ts' because main moved a lot since your last merge (the branch is about 100 commits behind). Merge main into this branch NOW in your worktree, resolve src/server/server.ts (keep BOTH sides: main now has the 0693 watchdog/handoff-failure-loop wiring, 0683 background host probing, 0688 CTO action routes, 0678 stall/credit wiring, 0705 and 0695 changes landing), rerun repoos check --changed main, commit, and hand off again. Do it quickly: main moves every few minutes, so merge and hand off in one go.

## Activity

- 2026-10-05T16:58:40Z · created · unknown
- 2026-10-05T17:16:53Z · story
- 2026-10-05T17:16:54Z · body: section Story context
- 2026-10-06T01:49:16Z · status inbox→ready
- 2026-10-06T01:49:17Z · cli_override, model_override
- 2026-10-06T01:49:17Z · status ready→active, branch
- 2026-10-06T03:13:01Z · body
- 2026-10-06T03:26:34Z · body
- 2026-10-06T03:34:19Z · body
- 2026-10-06T03:42:55Z · note: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T03:49:31Z · body
- 2026-10-06T03:58:31Z · body
- 2026-10-06T04:02:59Z · body
- 2026-10-06T04:04:09Z · status active→review
- 2026-10-06T04:04:09Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-06T04:04:53Z · note: review pass 1: good to go
- 2026-10-06T04:29:19Z · status review→active
- 2026-10-06T04:29:27Z · status active→review
- 2026-10-06T04:29:27Z · status review→active
- 2026-10-06T06:01:08Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-06T06:01:09Z · status active→review
- 2026-10-06T06:01:10Z · status review→active
- 2026-10-06T06:02:02Z · handoff failed · task-file handoff failed at check · remote validation unavailable: ssh upload of candidate bundle to mini failed: ssh: connect to host 100.126.187.126 port 22: Operation timed out
[stdin error: EPIPE: broken pipe, write] — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-10-06T06:07:36Z · status active→review
- 2026-10-06T06:07:36Z · status review→active
- 2026-10-06T06:12:52Z · status active→review
- 2026-10-06T06:12:52Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-06T06:13:42Z · note: review pass 2: good to go
- 2026-10-06T06:16:23Z · handoff failed · merge conflict unresolved after 2 automatic retries · merge conflict in src/server/server.ts — resolve it in the feature branch's own worktree (merge main into the branch), then retry
- 2026-10-06T06:16:44Z · handoff failed · merge conflict unresolved after 2 automatic retries · merge conflict in src/server/server.ts — resolve it in the feature branch's own worktree (merge main into the branch), then retry
- 2026-10-06T06:24:30Z · body: section Driver feedback (round 3): merge conflict again
- 2026-10-06T06:24:33Z · status review→active
- 2026-10-06T06:32:20Z · status active→review
- 2026-10-06T06:32:21Z · status review→active
- 2026-10-06T06:42:39Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-06T06:50:30Z · status active→review
- 2026-10-06T06:50:30Z · status review→active
- 2026-10-06T06:51:36Z · status active→review
- 2026-10-06T06:51:36Z · status review→active
- 2026-10-06T07:04:18Z · needs_input
- 2026-10-06T07:04:55Z · agent exited with an error (cursor) · Degenerate output loop detected after one automatic retry.
- 2026-10-06T07:13:33Z · needs_input
- 2026-10-06T07:13:44Z · agent exited with an error (cursor) · {"type":"tool_call","subtype":"started","call_id":"tool_14bacaca-6e04-4025-a8d7-77e9663c806","tool_call":{"shellToolCall":{"args":{"command":"cd /Users/nick/code/nick/repoos-worktrees/feat/close-out-reliability-sensible-default-t && git status && git stash list","workingDirectory":"","timeout":30000,"toolCallId":"tool_14bacaca-6e04-4025-a8d7-77e9663c806","simpleCommands":["cd","git","git"],"hasInputRedirect":false,"hasOutputRedirect":false,"parsingResult":{"parsingFailed":false,"executableComman
- 2026-10-06T07:18:58Z · model_override

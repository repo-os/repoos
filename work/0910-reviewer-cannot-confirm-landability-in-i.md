---
id: "0910"
title: "Reviewer cannot confirm landability in its sandbox and returns 'needs some work' with no bugs: feed it the landing checklist"
type: feature
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/reviewer-cannot-confirm-landability-in-i
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-21T19:45:25Z"
updated_at: "2026-10-22T01:45:26Z"
dev_error_count: 3
---
## Problem
2026-10-22: #0899 got five review passes in a row (1-5) that all end 'needs some work' with 'Bugs: None found'. The only stated reason each time is that the reviewer could not confirm RepoOS landability or clean mergeability: its sandbox could not reach the RepoOS server (so repoos landable failed) and git merge-tree --write-tree failed to create a temporary file. The task's real pre-checks all passed (review lock, clean worktree, only its own work file conflicting, 9 files in scope). After enough rounds the task hit review-rounds-exhausted and flagged needs_input. A review that cannot run the landability commands should never turn into a negative verdict; it also burns review rounds and blocks the driver and the human from landing a correct task.

## Desired UX
The reviewer is given the landing checklist result up front (server-computed, the same data as repoos landable) and is told not to re-run it. If it still cannot confirm something environmental, that goes under a separate 'could not verify' note that does not change the verdict and does not count as a review round. A task with Bugs none and a green server-side checklist can get 'good to go'.

## Acceptance criteria
- The review prompt includes the server-computed landable checklist for the reviewed commit (review lock, clean worktree, merge result with main, scope, main clean) as facts, and instructs the reviewer to rely on it.
- A new section or marker 'Could not verify (environment)' exists in the report format; reviewer failures to run commands (server unreachable, temp file errors, sandbox limits) go there and are excluded from the verdict and from the rounds counter.
- review-rounds-exhausted is not raised by environment-only passes; add a test with a fake reviewer that reports only environment failures.
- Parser and landable gate tests updated (src/core/review-report-sections.ts, src/core/landable.ts); docs/close-out-pipeline.md and docs/debugging-check-failures.md explain it.

## Notes for AI
Reproduce with .repoos/reviews/0899/1.md to 5.md. The reviewer for those passes was codex gpt-6-luna. Related: #0894 (Bugs 'None found.' parsing, landed).

## Activity

- 2026-10-21T19:45:25Z · created · njachowski@gmail.com
- 2026-10-21T19:47:40Z · status inbox→ready
- 2026-10-21T19:47:44Z · cli_override, model_override
- 2026-10-21T19:47:45Z · status ready→active, branch
- 2026-10-21T20:03:44Z · message_queued at 2026-10-21T20:03:44.971Z
- 2026-10-21T20:03:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T20:03:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T23:51:38Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T00:20:17Z · engineer stopped by request
- 2026-10-22T00:51:59Z · status active→ready
- 2026-10-22T01:09:19Z · status ready→active
- 2026-10-22T01:09:22Z · message_delivered: 1 message(s)
- 2026-10-22T01:14:24Z · agent exited with an error (opencode) · error: Go usage limit exceeded
- 2026-10-22T01:14:24Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:14:26Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:14:27Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/deepseek-v4.1-flash) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-22T01:15:05Z · cli_override, model_override
- 2026-10-22T01:15:05Z · needs_input
- 2026-10-22T01:15:18Z · status active→ready
- 2026-10-22T01:15:23Z · status ready→active
- 2026-10-22T01:18:16Z · body
- 2026-10-22T01:18:17Z · body
- 2026-10-22T01:22:31Z · body
- 2026-10-22T01:22:31Z · body
- 2026-10-22T01:25:20Z · body
- 2026-10-22T01:25:20Z · body
- 2026-10-22T01:34:10Z · handoff failed · remote validation failed: test failure: tests/default-agent-prompts.test.ts > shared review mission prompt (#0872) > names the earlier-report directory, the whole-class grep, evidence gaps and the merge check on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T01:39:29Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/default-agent-prompts.test.ts > shared review mission prompt (#0872) > names the earlier-report directory, the whole-class grep, evidence gaps and the merge check on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T01:43:35Z · body
- 2026-10-22T01:43:36Z · body
- 2026-10-22T01:45:26Z · body
- 2026-10-22T01:45:26Z · body

## TL;DR

Task #1098 shipped plain-language explanations for common agent failures across task cards, drawers, board notices, the Agents page, and crash-recovery activity. Final verdict: **good to go**.

## Outcome

The feature classifies common authentication, unavailable-model, usage-limit, and network errors, gives a short explanation and next step, and keeps the raw CLI error available. Auth and model failures create one deduplicated board notice per CLI, cleared after a successful run. The Agents page shows each agent’s latest run status and reason. **Final verdict: good to go; task completed and merged.**

## Process stats

- Development: 5 recorded engineering rounds; review: 6 passes.
- Start to done: 2026-11-12 05:35:20 UTC to 2026-11-13 05:54:39 UTC. Wall-clock duration: not recorded.
- Engineer: `gpt-6-luna`. Reviewer: `composer-2.5`. A debugger session used `deepinfra/deepseek-ai/DeepSeek-V4.1-Flash`. Model-router sessions used `typesafe/jev-1.14-20261014`.
- Engineer sessions: 2 records, with elapsed times of 6662s and 938s; the records share the same start timestamp. Reviewer sessions: 5, with elapsed times of 70s, 115s, 33s, 60s, and 140s. Debugger: 5s. Restarts and swaps: not recorded as counts.
- Tokens: engineer sessions recorded 112,673,597 and 33,961,642; router sessions recorded 2,570, 3,380, 3,773, 4,374, 4,825, and 5,494. Reviewer and debugger token counts: not recorded. Cost: one engineer session recorded $0.15; other costs not recorded.

## What went wrong

- An early engineer turn ended without requesting handoff; its log included a `write_stdin` unknown-process-id error. Work resumed and later reached review.
- Close-out initially hit a merge conflict and foreign task-bookkeeping scope issues. RepoOS repaired the branch bookkeeping; subsequent reviews found the task-scoped diff clear.
- Several handoffs or validations failed or stalled: a pressure-guard test failure on a remote host, a remote gate failure, a test timeout in `handoff-unification.test.ts`, and a hung validation container. Focused reruns passed; later changed-scope and full checks passed, including a full run of 708 test files. RepoOS retried remote validation on other hosts.
- Reviews requested fixes to the documentation heading and coverage, preservation of usage-limit reset time, the failure-card screenshot fixture, and test isolation for an inherited remote-validation flag. These were addressed in later rounds.
- The task had delayed queued messages and required engineer restarts after turns ended without handoff. It ultimately passed review and the close-out gate.

## Learnings

- Keep agent failure classification in a shared pure helper so task surfaces, notices, and crash recovery use consistent explanations while retaining raw provider output. The implementation and tests are in `src/core/agent-failure.ts`.
- Key durable board notices by CLI and clear them after a successful run; this makes repeated task failures actionable without accumulating duplicate setup alerts.
- When subprocess tests launch the CLI, clear inherited orchestration flags that affect the behavior under test. The remote-gate environment leak was fixed in `tests/pre-review-remote-gate.test.ts`.
- Remote timeouts should be reproduced before changing unrelated code; focused and full-suite reruns distinguished transient host issues from feature defects.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

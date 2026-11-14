## TL;DR

Fixed stale queue entry cleanup and a zero-wait lock gate hang. Review verdict: **good to go**; task merged and marked done.

## Outcome

The host lock queue scan now continues past live higher-priority waiters so it can remove stale dead-PID entries. The regression test uses a controlled child process, checks only relevant queue entries, and removes its wall-clock ceiling. An adjacent fix makes zero-wait callers exit when the acquire gate is occupied. The cause and test pitfalls are documented in `docs/debugging-check-failures.md`.

Final review verdict: **good to go**. Merged as `f53f7827944985caa4e9e48994d7667483030c48`.

## Process stats

- Engineering rounds: 1. Review rounds: 1.
- Wall-clock from task creation to done: 5h 26m 39s.
- Engineer: `gpt-6-luna`; recorded elapsed time 12,369s and 35,374,588 tokens. Cost: not recorded. No restarts or model swaps recorded.
- Reviewer: `composer-2.5`; elapsed time 32s. Tokens and cost: not recorded.
- Routing session: `typesafe/jev-1.14-20261014`; 2,480 tokens. Cost: not recorded.

## What went wrong

- The test selected a dead PID by adding a fixed offset to the Vitest worker PID. That PID could still exist, so its queue entry survived. The fixture now uses a child process the test terminates.
- The test asserted the entire shared wait directory had exactly one entry, making it sensitive to unrelated waiters. It now checks only the relevant entries.
- The production scan stopped at the first live higher-priority waiter, leaving later dead entries uncleaned depending on filename order. It now records the need to defer while continuing the scan.
- A zero-wait caller could loop indefinitely if the acquire-gate directory was occupied. The gate retry now exits after a failed acquisition attempt for zero-wait callers, with a regression test.
- A queued message was undelivered for 91 minutes; the engineer turn was ended to deliver it. An earlier turn also ended without requesting review, and model-refresh connection errors were logged. The eventual handoff and review succeeded; no separate recovery details were recorded.
- Verification passed: the pool and host-config suites passed together with 197 tests. The scoped check passed all 154 selected test files (2,749 passed, one skipped), along with formatting, lint, build, safety checks, rendered contrast, and UI smoke.

## Learnings

- Queue scans that both decide whether to defer and clean stale entries must finish examining the queue. The durable explanation is in `docs/debugging-check-failures.md`.
- Process-backed tests should control child lifetimes, avoid exact assertions on shared directories, and avoid scheduler-sensitive wall-clock ceilings. The task documentation records these fixture lessons.
- Zero-wait behavior should be checked across lock acquisition sub-loops as well as the outer polling loop. The reviewer noted that the top-of-loop check still requires `WAIT > 0`; the reported held-gate hang is covered, but broader zero-wait behavior is not established by this task.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

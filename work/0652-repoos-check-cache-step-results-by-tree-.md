---
id: "0652"
title: "repoos check: cache step results by tree hash so unchanged reruns return instantly"
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/repoos-check-cache-step-results-by-tree-
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-04T16:32:02Z"
updated_at: "2026-10-05T02:34:12Z"
review_rounds: 2
review_passes: 2
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-04T23:41:37.441Z: server-side finalization timed out (deadline exceeded)"
---
## Problem
40% of repoos check runs by engineer agents (181 of 456) had no edit or write since the previous check (upper bound: some follow bun run fmt, which changes files without an edit call). Full runs are slow (opencode-measured p90 about 185s for check, 88s for build). 141 of 203 sessions also ran bun run build by hand even though the check builds.

## Desired UX
Re-running repoos check on a tree whose relevant inputs have not changed returns cached passing step results immediately and says so. Failed steps are never cached as passes.

## Acceptance criteria
- Per-step cache keyed by a hash of the step's inputs (tracked and untracked files that matter, tool versions, step config, runtime); a step is re-run when any input differs.
- Close-out and the remote/CI gate always run the full plan uncached (or provably equivalent); cache is local to interactive/pre-review runs. State this decision in docs/close-out-pipeline.md.
- Output labels cached steps (e.g. 'cached, tree <hash>') so nobody mistakes them for fresh runs; a --no-cache flag forces a fresh run.
- Non-deterministic steps (smoke, contrast audit) are either keyed on build output hash or excluded; document which.
- Tests: hit, miss on edit, miss on config change, never caches a failure, close-out bypass.

## Notes for AI
Design risk is correctness, not speed: a stale cache hit that lets a broken tree through the gate is worse than the time saved. Prefer excluding a step to caching it unsafely. Shares check output with #0651 (auto-format and failed-steps summary); keep the two independent.

## Activity

- 2026-10-04T16:32:02Z · created · unknown
- 2026-10-04T16:33:18Z · body: section Notes for AI
- 2026-10-04T16:56:41Z · priority
- 2026-10-04T17:42:53Z · status inbox→ready
- 2026-10-04T23:01:46Z · status ready→active, branch
- 2026-10-04T23:18:49Z · status active→review
- 2026-10-04T23:18:50Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-04T23:19:43Z · status review→active
- 2026-10-04T23:24:47Z · status active→review
- 2026-10-04T23:24:47Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-04T23:41:34Z · needs_input
- 2026-10-05T02:13:25Z · review_cli_override, review_model_override
- 2026-10-05T02:13:33Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-10-05T02:15:25Z · status review→active
- 2026-10-05T02:28:45Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/serve-reaper.test.ts:460:22
    458|       const reaped = await sweep.cleanupOrphanedRoots();
    459|
    460|       expect(reaped).toBeGreaterThanOrEqual(1);
       |                      ^
    461|       const outcome = await exited;
    462|       // The sweep's SIGTERM terminated it; the child must not have su…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 385 passed | 1 skipped (387)
      Tests  1 failed | 4689 passed | 15 skipped (4705)
   Start at  02:24:50
   Duration  231.39s (transform 5.72s, setup 1.97s, import 40.46s, tests 200.01s, environment 198.38s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 408ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  02:28:42
   Duration  2.17s (transform 957ms, setup 11ms, import 1.20s, tests 408ms, environment 472ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-05T02:34:12Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/serve-reaper.test.ts:460:22 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-05T02:34:12Z · status review→active

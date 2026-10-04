---
id: "0652"
title: "repoos check: cache step results by tree hash so unchanged reruns return instantly"
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/repoos-check-cache-step-results-by-tree-
created_at: "2026-10-04T16:32:02Z"
updated_at: "2026-10-04T23:18:49Z"
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

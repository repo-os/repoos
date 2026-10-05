---
id: "0655"
title: "repoos check: re-run previously failed tests first, and triage single-test failures in isolation"
type: feature
status: ready
priority: medium
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T03:18:48Z"
updated_at: "2026-10-05T03:18:59Z"
---
## Problem
A failing test costs a full-suite run to discover and again to confirm. From .repoos/checks.db: 43 runs failed in the tests step (avg 414s) and 15 in remote-validation (avg about 1,236s, includes remote queue/wait). The six most recent failing runs with recorded test names each had ONE failing test out of about 4,690 and ran 260-290s (one 1,039s) before reporting it. serve-reaper.test.ts (orphaned-root sweep) appears at least twice, and failed #0652's handoff on 2026-10-05 while 4,689 others passed. Failed test names are already stored in check_runs.failed_tests (58 runs).

## Desired UX
1. Failed-first: after a failed run, the next repoos check in the same worktree/task runs the previously failing test files FIRST and stops immediately if they still fail (seconds instead of minutes). If they pass, the rest of the suite still runs in full; nothing is skipped.
2. Flake triage: when a run's only failure is a single test (or a small number), re-run just that file in isolation a few times (default 3, configurable) and record the outcome on the run (for example 'passed 3/3 alone' or 'failed 3/3 alone'). The label is informational: it never turns a failed run green on its own.

## Acceptance criteria
- Scope: interactive/CLI and pre-review runs only. Close-out and the remote close-out gate are unchanged and always run the full suite; state this in docs/close-out-pipeline.md and user-docs/check.md.
- A green result is only ever reported after the full suite (or the profile's normal scope, e.g. --changed) has run to completion on the final tree. Failed-first is an ordering optimisation, not a skip. Test covers: previously-failed files run first; failure there short-circuits with a clear message; pass there continues to the full run.
- Isolation re-runs record their result in the run history (check_runs / run detail) and show in the Checks UI where failed tests are listed. No automatic green and no automatic retry-to-green. Respect AGENTS.md: reproducing in isolation on an idle machine means a real bug; a pass in isolation does NOT prove a flake under load, so word the label accordingly.
- Works from the failed_tests data already recorded; find how the tests step invokes vitest (scripts/run-tests.mjs and the check plan) and pass file filters through it without breaking the two-pass runner (the latency-sensitive boot-timing pass).
- Settings UI control for the re-run count per AGENTS.md (every user-facing repoos.toml feature setting needs one), with a test.
- Tests for: no prior failure (no change in behaviour), prior failure still failing, prior failure now passing, single-test failure triage, multi-file failure (skip triage above a small cap).

## Notes for AI
Context: split out of the #0652 analysis (check-result cache, parked). Skipping previously-passed tests as a gate is explicitly rejected: a fix for one test can break another, and the gate guarantees the whole suite on the final tree. Do not add a result cache here. Measure after shipping: time-to-first-failure on reruns, and how often the isolation label is 'passed alone'.

## Activity

- 2026-10-05T03:18:48Z · created · unknown
- 2026-10-05T03:18:59Z · status inbox→ready

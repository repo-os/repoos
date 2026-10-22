---
id: "0935"
title: "Flaky test: agent-review 'does not re-raise an exhausted-rounds flag dismissed during the review'"
type: bug
status: done
priority: p2
area: core
merged_commit: ffb7c8942b2425af8ee1ad04cdad41586aeea0d0
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/flaky-test-agent-review-does-not-re-rais
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T14:02:13Z"
updated_at: "2026-10-22T14:31:49Z"
last_close_out_gate_ms: 245521
last_close_out_gate_at: "2026-10-22T14:31:16.566Z"
review_passes: 1
---
## Problem
tests/agent-review.test.ts > 'agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review' failed on a remote runner twice on 2026-10-22: #0933 pre-review handoff (10:47Z) and #0923 close-out attempt 2 on thinkpad (13:27Z, a 16-minute run). Both times a retry passed, with no change to the code under test. By AGENTS.md triage this should reproduce in isolation if it is a real bug; the pattern (only on remote runners, only under load) points to a timing race in the test or in the review/flag code (dismissal landing before or after the exhausted-rounds raise).

## Desired UX
The test is deterministic: remove the race (gate/await the dismissal ordering) instead of adding a retry or longer timeout. A failing close-out must not be caused by this test.

## Acceptance criteria
- Reproduce under CPU contention (run the file repeatedly with parallel load) before and after the fix.
- The ordering the test asserts is enforced by the code (or an explicit test hook), not by sleeps.
- Passes 20 consecutive runs under load.

## Notes for AI
See AGENTS.md 'Is a repoos check failure a flake or a real bug?' and the #0330 race-removal approach.

## Activity

- 2026-10-22T14:02:13Z · created · njachowski@gmail.com
- 2026-10-22T14:02:56Z · status inbox→ready
- 2026-10-22T14:03:02Z · cli_override, model_override
- 2026-10-22T14:03:03Z · status ready→active, branch
- 2026-10-22T14:09:05Z · body
- 2026-10-22T14:20:00Z · status active→review
- 2026-10-22T14:20:00Z · note: shots: skipped — the diff (2 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-22T14:21:08Z · note: review pass 1: good to go
- 2026-10-22T14:31:16Z · close-out gate completed in 246s
- 2026-10-22T14:31:49Z · status done→done, release:success

---
id: "0698"
title: "Invented evidence: reviewer and engineer defaults should catch claims an agent cannot have produced; flag human-only acceptance criteria"
type: feature
status: done
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: real device, physical hardware, credentials or keys)"
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
merged_commit: 6be08d24a35eabb39ff7a3a085b7e0ce04b828ca
assigned_to: ai
created_by: ""
branch: feat/invented-evidence-reviewer-and-engineer-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:15:46Z"
updated_at: "2026-10-06T23:48:14Z"
last_handoff_failure_fingerprint: "check|repoos check failed: [32m✓[39m tests/mtd-close-out-deps.test.ts [2m([22m[2m4 tests[22m[2m)[22m[33m 882[2mms[22m[39m · [33m[2m✓[22m[39m publishCandidate runs post-publish refresh and a later symlink-main candidate sees it [33m 498[2mms[22m[39m · [32m✓[39m tests/debugger-integration.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1350[2mms[22m[39m · [33m[2m✓[22m[39m runs a diagnosis when enabled and serves it back [33m 429[2mms[22m[39m · [33m[2m✓[22m[39m does not re-broadcast a turn the panel already drew optimistically (#0443) [33m 411[2mms[22m[39m · [32m✓[39m tests/release-fallback.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 540[2mms[22m[39m · [32m✓[39m tests/mtd-cancel.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 859[2mms[22m[39m · [33m[2m✓[22m[39m tears down an already-created candidate when cancellation arrives later [33m 342[2mms[22m[39m"
last_handoff_failure_sha: 36bbf34820faf5c2ae64cbf3251c5a07591201a2
merge_conflict_retry_count: 1
review_passes: 1
last_check_failure: "repoos check at 2026-10-06T15:38:56.453Z: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal"
handoff_signal_retry_count: 2
dev_error_count: 1
---
## Problem

On tuk-private, an engineer asked for real-device proof wrote a complete fake record (`Google Pixel 7 (GVU6C)`, `Mobile 5G (AIS Thailand)`, `342 fixes received by backend`); another marked app IDs and Firebase projects `CONFIRMED` that nobody decided or created, and wrote `Dev API was called read-only` after making two `POST user_states` writes in a task specced as strict read-only. Three review passes each did not flag any of it. The tasks themselves mixed agent work with work only a human can do (devices, accounts, external registrations), which invited the invention.

## Desired UX

The default reviewer flags fabricated or impossible evidence and unauthorised writes as blocking; the default engineer prompt says to leave unobservable evidence blank; a task whose acceptance criteria need a device, an account or an external human decision is flagged at creation with a suggestion to split out a human-only task.

## Acceptance criteria

- [ ] Default reviewer instructions (and the built-in review prompt) include: flag as blocking any claim of evidence the agent could not have produced (physical-device sessions, measurements, external accounts or registrations marked confirmed, live responses without a stated safe call) and any write the spec forbids; compare "read-only" specs against write calls visible in the diff/transcript.
- [ ] Default engineer instructions in `repoos init`'s template and the built-in prompt: never invent evidence; leave it blank and say a human must supply it.
- [ ] The underspecified-task assessment (#0668) also flags acceptance criteria mentioning real devices, physical hardware, accounts, credentials or third-party registrations, with the reason `needs-human-step` and a hint to split a human-only task.
- [ ] Tests for the new flag and for the prompt text; docs: `user-docs/running-with-agents.md` §1 gets one bullet about separating human-only steps.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 2, 4.

The tuk-private repo's `repoos.toml` now carries hand-written versions of these instructions (engineer/reviewer `instructions`) that can serve as a starting point.

## Activity

- 2026-10-06T03:15:46Z · created · unknown
- 2026-10-06T04:37:26Z · status inbox→ready
- 2026-10-06T04:37:27Z · cli_override, model_override
- 2026-10-06T04:37:27Z · status ready→active, branch
- 2026-10-06T04:45:22Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T06:01:09Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-06T13:44:42Z · status ready→active
- 2026-10-06T14:04:02Z · needs_input
- 2026-10-06T14:42:52Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T14:42:52Z · status review→active
- 2026-10-06T14:52:52Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-06T14:57:53Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · server-side finalization timed out (deadline exceeded) · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T14:57:53Z · status review→active
- 2026-10-06T15:02:51Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —     344|       await waitForReviewRunning(server, task.id, false);
345|       expect(readFileSync(task.absPath, "utf8")).toMatch(/^review_pass…
|                                                  ^
346|
347|       const returned = await api(server, "PATCH", `/api/tasks/${task.i…
❯ withServer tests/agent-review.test.ts:279:11
❯ tests/agent-review.test.ts:341:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
Test Files  1 failed | 417 passed | 1 skipped (419)
Tests  1 failed | 5048 passed | 15 skipped (5064)
Start at  14:58:23
Duration  261.81s (transform 6.41s, setup 2.33s, import 47.70s, tests 209.08s, environment 238.04s)
RUN  v4.1.10 /repo/src/ui-app
✓ tests/boot-timing.test.ts (2 tests) 411ms
Test Files  1 passed (1)
Tests  2 passed (2)
Start at  15:02:45
Duration  2.24s (transform 1.04s, setup 11ms, import 1.29s, tests 411ms, environment 459ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-06T15:02:54Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · server-side finalization timed out (deadline exceeded) · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T15:02:55Z · status review→active
- 2026-10-06T15:12:54Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-06T15:17:54Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-06T15:19:33Z · note: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T15:38:53Z · note: ui verification failed (1 issue(s)): [pageerror] No identifiers allowed directly after numeric literal
- 2026-10-06T15:54:31Z · status active→review
- 2026-10-06T15:54:31Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-06T15:55:20Z · note: review pass 1: good to go
- 2026-10-06T16:26:51Z · status review→active
- 2026-10-06T16:27:10Z · handoff failed · ui-review handoff failed at check · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0698-53a5b0d2.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (db995368dd1423d6d064eadbf4545ed1ab7b5d94) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:36:29Z · handoff failed · ui-review handoff failed at check · repoos check failed: [validate] cloning bundle /home/nick/.repoos-pre-review-61575a6e.bundle · warning: You appear to have cloned an empty repository. · fatal: unable to read tree (db995368dd1423d6d064eadbf4545ed1ab7b5d94) · [remote validation FAILED (exit 128) in 4s on bee] · ✗ remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · [validate] cloning bundle /home/nick/.repoos-pre-review-61575a6e.bundle · warning: You appear to have cloned an empty repository. · fatal: unable to read tree (db995368dd1423d6d064eadbf4545ed1ab7b5d94) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:41:41Z · handoff failed · ui-review handoff failed at check · repoos check failed: [validate] cloning bundle /home/nick/.repoos-pre-review-d322d500.bundle · warning: You appear to have cloned an empty repository. · fatal: unable to read tree (bcc18ead3bc4f7b9a69660efe505763b0a7e04c2) · [remote validation FAILED (exit 128) in 3s on bee] · ✗ remote validation failed: remote validation failed (exit 128) — [lock] slot 0 acquired after 0s · [validate] cloning bundle /home/nick/.repoos-pre-review-d322d500.bundle · warning: You appear to have cloned an empty repository. · fatal: unable to read tree (bcc18ead3bc4f7b9a69660efe505763b0a7e04c2) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:46:36Z · handoff failed · ui-review handoff failed at check · repoos check failed: [validate] cloning bundle /home/nick/.repoos-pre-review-0d2c60a6.bundle · warning: You appear to have cloned an empty repository. · fatal: unable to read tree (c9612904e88034feea7d09a578cee3d3dbea1399) · [remote validation FAILED (exit 128) in 4s on bee] · ✗ remote validation failed: remote validation failed (exit 128) — [lock] slot 0 acquired after 0s · [validate] cloning bundle /home/nick/.repoos-pre-review-0d2c60a6.bundle · warning: You appear to have cloned an empty repository. · fatal: unable to read tree (c9612904e88034feea7d09a578cee3d3dbea1399) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:51:42Z · handoff failed · ui-review handoff failed at check · repoos check failed: [32m✓[39m tests/mtd-close-out-deps.test.ts [2m([22m[2m4 tests[22m[2m)[22m[33m 882[2mms[22m[39m · [33m[2m✓[22m[39m publishCandidate runs post-publish refresh and a later symlink-main candidate sees it [33m 498[2mms[22m[39m · [32m✓[39m tests/debugger-integration.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1350[2mms[22m[39m · [33m[2m✓[22m[39m runs a diagnosis when enabled and serves it back [33m 429[2mms[22m[39m · [33m[2m✓[22m[39m does not re-broadcast a turn the panel already drew optimistically (#0443) [33m 411[2mms[22m[39m · [32m✓[39m tests/release-fallback.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 540[2mms[22m[39m · [32m✓[39m tests/mtd-cancel.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 859[2mms[22m[39m · [33m[2m✓[22m[39m tears down an already-created candidate when cancellation arrives later [33m 342[2mms[22m[39m
- 2026-10-06T17:02:26Z · handoff failed · ui-review handoff failed at check · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0698-d61d6381.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (d9b027c8a905fb78ea2f2613a250bf35d5f9782b) — fix it in the feature branch and re-run the gate
- 2026-10-06T17:21:11Z · status active→review
- 2026-10-06T23:48:04Z · status review→done, release:success
- 2026-10-06T23:48:14Z · needs_input

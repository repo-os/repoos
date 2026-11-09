---
id: "1080"
title: "Review loop: cap rounds with an automatic scope freeze, priority-aware blocking bar, honour accepted-scope sections, auto-file follow-ups"
type: feature
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/review-loop-cap-rounds-with-an-automatic
cli_override: claude code
model_override: haiku
created_at: "2026-11-09T12:14:25Z"
updated_at: "2026-11-09T17:00:19Z"
review_rounds: 2
review_passes: 2
last_check_failure: "repoos check at 2026-11-09T15:23:19.003Z: repoos check failed: ui verification failed (3 issue(s)): [console] Failed to preconnect to https://fonts.googleapis.com/. Error: The Internet connection appears to be offline.; [console] Failed to preconnect to https://fonts.gstatic.com/. Error: The Internet connection appears to be offline.; [request] Failed to load resource: The Internet connection appears to be offline. (https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&family=P… (truncated)"
handoff_signal_retry_count: 2
---
## Problem
Tasks routinely take 10-15 review rounds (#1058, #1060, #1061 each took 15; #1070 is at 4+). Each round is 20-40 minutes. Rounds are dominated by narrow edge cases found one at a time, reviewer bars that drift between rounds, and housekeeping failures, not by real defects in the change. The review prompt (`src/server/review.ts`) already says to report the whole bug class in one pass and never hold an instance back, and `review.humanFlagAfterPasses` (default 5) only flags needs-input; neither stops the loop.

## Desired UX
A review converges in 2-4 rounds. After that, remaining findings that are not real correctness or landing blockers become suggestions and follow-up tasks automatically, so the human can Move to done without hand-editing scope.

## Acceptance criteria
1. **Automatic freeze after N passes** (setting `review.freezeAfterPasses`, default 4, Settings UI control per AGENTS.md): from pass N+1 the reviewer prompt switches to "blocking = (a) a defect in behaviour this task introduced that breaks its own acceptance criteria, (b) a regression of existing behaviour, (c) a landing blocker. Everything else, including further edge cases of an already-fixed class and hardening ideas, goes under a new `## Suggestions (non-blocking)` heading and must not change the verdict."
2. **Priority-aware bar**: p3 tasks and tasks whose title starts with "Easter eggs bundle" use the lighter bar from pass 1 (correctness bugs and landing blockers only); p1/p2 use the full bar until the freeze.
3. **Accepted-scope sections are authoritative**: if the task body contains `## Accepted scope and known limitations` (any heading starting with "Accepted scope"), the reviewer prompt must quote it and say items listed there, and anything the section explicitly supersedes (for example acceptance criteria), are not blocking; add a test with a fixture task body.
4. **One enumeration**: require the report to end the `## Bugs` section with a one-line statement "No further findings of this class were found after grepping: <list>" and fix the prompt wording that lets a reviewer stop at the first instance; plus ask the engineer, in the handoff instructions, to self-review against the same checklist before requesting review.
5. **Auto follow-ups**: when a review has non-blocking suggestions after the freeze, offer a one-click "Create follow-up task" in the review panel (and `repoos` CLI parity) that files a task pre-filled from those findings; never files automatically without the human.
6. **Convergence report**: record for each task the number of rounds and the finding classes in `repoos stats` or the task drawer so repeated classes are visible; show "round N of ~4" in the review panel.
7. Prompts live in one place with tests (`default-agent-prompts.test.ts`); docs updated (docs/agent-workflow-rules.md, user-docs/review-and-close-out.md).
8. Housekeeping failures that waste rounds are NOT in this task; they are #1076 (stray other-task bookkeeping in branches) and #1061 (bookkeeping commits invalidating checks). Reference them in the report.

## Notes for AI
Start from `src/server/review.ts` (prompt around the "Earlier passes and the whole bug class" section, the `repeatedClasses` branch), `src/core/config.ts` (`review.humanFlagAfterPasses`, defaults and schema), `src/ui-app/tests/default-agent-prompts.test.ts`, and the review reports in work/reports/1058, 1060 and 1061 for real examples of the loop. The quickest, lowest-risk part is criteria 1-3 (prompt and setting only): land those first as one reviewable commit. Do not edit repoos.toml.

## Priority and slicing (owner, 2026-11-09 night)
The owner wants tasks to converge in a few rounds. Ship in two slices and hand off the FIRST slice as fast as possible, small and low-risk: SLICE 1 = acceptance criteria 1, 2 and 3 only (automatic freeze after review.freezeAfterPasses passes, lighter bar for p3 and easter-egg tasks, accepted-scope sections are authoritative) as a prompt-and-setting change in src/server/review.ts and src/core/config.ts with its Settings control and tests; no UI beyond that control. SLICE 2 (a separate follow-up task, file it) = criteria 4-7 plus a NEW criterion: an explicit owner override, 'Land anyway' in the Move-to-done flow with a confirmation dialog and a recorded reason, that is allowed only when the remaining review findings are NOT landing blockers (verdict needs-work but landing checks pass), so the human can accept known risk instead of looping; it never bypasses landing checks, tests or the close-out pipeline. Do not start slice 2 here.

## Shots
```json
[]
```

## Activity

- 2026-11-09T12:14:25Z · created · njachowski@gmail.com
- 2026-11-09T13:16:00Z · cli_override, model_override
- 2026-11-09T13:16:01Z · status inbox→ready
- 2026-11-09T13:16:03Z · status ready→active, branch
- 2026-11-09T13:16:58Z · body: Priority and slicing (owner, 2026-11-09 night) (added)
- 2026-11-09T13:16:58Z · message_queued at 2026-11-09T13:16:58.461Z
- 2026-11-09T13:16:58Z · message_queued at 2026-11-09T13:16:58.782Z
- 2026-11-09T13:21:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T13:27:04Z · message_queued at 2026-11-09T13:27:04.740Z
- 2026-11-09T13:51:14Z · body
- 2026-11-09T13:52:04Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-11-09T13:52:04Z · message_queued at 2026-11-09T13:52:04.078Z
- 2026-11-09T13:52:04Z · ↻ resuming engineer to read queued message
- 2026-11-09T13:52:04Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check is still running its tests. I'll wait for the background job to report completion. · stderr: (empty)
- 2026-11-09T13:57:19Z · message_queued at 2026-11-09T13:57:19.914Z
- 2026-11-09T13:58:48Z · message_delivered: 4 message(s)
- 2026-11-09T14:37:10Z · body
- 2026-11-09T14:40:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T14:57:33Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-09T14:57:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The step re-run is in progress. I'll wait for its completion notification. · stderr: (empty)
- 2026-11-09T14:57:48Z · message_delivered: 1 message(s)
- 2026-11-09T15:05:15Z · message_queued at 2026-11-09T15:05:15.021Z
- 2026-11-09T15:05:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T15:10:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T15:13:53Z · body
- 2026-11-09T15:15:14Z · CTO nudge: held — handoff gate is running
- 2026-11-09T15:23:15Z · note: ui verification failed (3 issue(s)): [console] Failed to preconnect to https://fonts.googleapis.com/. Error: The Internet connection appears to be offline.; [console] Failed to preconnect to https://fonts.gstatic.com/. Error: The Internet connection appears to be offline.; [request] Failed to load resource: The Internet connection appears to be offline. (https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght
- 2026-11-09T15:23:15Z · message_queued at 2026-11-09T15:23:15.912Z
- 2026-11-09T15:25:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T15:28:35Z · message_queued at 2026-11-09T15:28:35.307Z
- 2026-11-09T15:33:37Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T15:33:37Z · note: handoff requested (cli)
- 2026-11-09T15:35:14Z · CTO nudge: held — handoff gate is running
- 2026-11-09T15:39:44Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-09T15:39:45Z · status active→review
- 2026-11-09T15:39:45Z · message_queued at 2026-11-09T15:39:45.410Z
- 2026-11-09T15:40:47Z · note: review pass 1: needs some work
- 2026-11-09T15:40:47Z · message_queued at 2026-11-09T15:40:47.406Z
- 2026-11-09T15:40:47Z · status review→active
- 2026-11-09T15:40:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T15:43:05Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (f6a6e0eca) during finalization (#0734)
- 2026-11-09T15:48:07Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T15:48:07Z · note: handoff requested (cli)
- 2026-11-09T15:50:14Z · CTO nudge: held — handoff gate is running
- 2026-11-09T16:06:06Z · message_queued at 2026-11-09T16:06:06.216Z
- 2026-11-09T16:06:06Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1080.md
- 2026-11-09T16:10:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T16:21:45Z · message_queued at 2026-11-09T16:21:45.969Z
- 2026-11-09T16:30:17Z · message_overdue: still queued after 60m without being delivered
- 2026-11-09T16:32:17Z · message_delivered: 1 message(s)
- 2026-11-09T16:34:07Z · queued message undelivered for 66m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-09T16:34:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The re-run is in progress, and I'll wait for its completion notification before re-requesting handoff. · stderr: (empty)
- 2026-11-09T16:34:21Z · message_delivered: 5 message(s)
- 2026-11-09T16:35:15Z · message_queued at 2026-11-09T16:35:15.048Z
- 2026-11-09T16:35:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T16:35:31Z · body
- 2026-11-09T16:40:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T16:58:08Z · body
- 2026-11-09T16:59:11Z · status active→review
- 2026-11-09T17:00:19Z · note: review pass 2: needs some work
- 2026-11-09T17:00:19Z · message_queued at 2026-11-09T17:00:19.484Z
- 2026-11-09T17:00:19Z · status review→active

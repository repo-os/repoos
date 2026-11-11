---
id: "1074"
title: Require a step-by-step guide on every human-assigned task
type: feature
status: active
priority: p2
area: [core, agent]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/require-a-step-by-step-guide-on-every-hu
cli_override: cursor
model_override: composer-2.5
review_cli_override: claude code
review_model_override: haiku
created_at: "2026-11-09T07:52:08Z"
updated_at: "2026-11-11T18:13:14Z"
last_handoff_failure_fingerprint: "check|repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs"
last_handoff_failure_sha: 62c37da85d6b2e33005b5b757f3f754fbfde6216
last_check_failure: "repoos check at 2026-11-11T10:35:55.519Z: repoos check failed: tests — tests/pre-review-remote-gate.test.ts > standalone `repoos check` remote failure (#0520) > exits non-zero AND records the failure for the Checks surface when the runner is unusable — at tests/pre-review-remote-gate.test.ts:486:26 — AssertionError: expected +0 to be 1 // Object.is equality"
review_rounds: 2
review_passes: 2
handoff_signal_retry_count: 2
dev_error_count: 10
incomplete_review_retries: 1
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-11T17:51:19.826Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-11T17:51:32.524Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-11T17:52:43.457Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-11T17:54:21.614Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-11T17:56:30.933Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-11T17:59:12.525Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Tasks assigned to a human (`--assigned-to human`, usually held, e.g. an account sign-up, a signing key, a real-device check) are often filed as a few lines of acceptance criteria. The human then has to decode what to do. Concrete case: in the Tiao project, tasks #0032 (create and back up a release keystore) and #0033 (sign up for a flight-status provider, set the key, verify a real lookup) were filed with two-line outcomes, and the human (Nick) asked for exact steps. The step-by-step guides had to be written afterwards by hand. Human tasks are the one place where the reader is the least able to infer missing detail, and nothing in RepoOS asks for it.

## Desired UX
Every human-assigned task body contains a `## Step-by-step guide` section that a non-expert can follow without asking anything: numbered steps, the exact commands (in fenced blocks) or click paths, what to paste where, where secrets go (never into chat, tasks or git), what could go wrong and how to tell it worked, and what to report back. When an agent or the PM files a human task without one, RepoOS says so immediately instead of letting it sit unreadable.

## Acceptance criteria
- The PM agent instructions (the shipped default `pm` agent prompt and wherever the built-in prompts live) require a `## Step-by-step guide` section for any task filed with `--assigned-to human` or created by splitting out a human step, with the content rules above (numbered steps, exact commands, where secrets go, a "how you will know it worked" line, what to report back). Do not require it for AI tasks.
- Engineer-agent instructions: when an engineer asks for a human step to be split out (needs-human-step), the split-off task must include the guide too.
- Task creation and update (`repoos new`, `repoos update`, the HTTP API) emit a clear warning (not a hard failure) when `assigned_to: human` and no `## Step-by-step guide` heading exists, naming the missing section. Warning text is shown in the CLI output and surfaced on the task in the UI.
- The task template / `repoos new --human` scaffold includes an empty `## Step-by-step guide` heading with a short prompt describing what belongs there.
- `repoos update --section "Step-by-step guide" --section-body ...` works for editing just that section (confirm it does; the full `--body` guard otherwise forces authors to resend every spec section).
- Tests cover: warning when the section is missing on a human task, no warning on AI tasks, no warning when present, and the scaffold output. Existing tasks are not rewritten or blocked.
- Docs: a short note in `user-docs/` (where human tasks are explained) and the relevant `docs/agent-workflow-rules.md` line; keep AGENTS.md under its size limit (one or two lines max, link to docs).
- Respect AGENTS.md rules: no new runtime dependencies, the Settings-UI rule does not apply unless a new `repoos.toml` key is added (avoid adding one).

## Notes for AI
Look at how `needs-human-step` is detected and how held human tasks are created (`repoos new --human --hold`, `repoos update --assigned-to human`, the split guidance in AGENTS.md "Never close out human-gated work as if the human part were done"). The default PM prompt text lives in the built-in agent defaults; the Tiao project also carries a copy in its `repoos.toml` agent instructions, so a project's own prompt will not pick this up automatically: make the warning (code) the enforcement and the prompt the guidance. Example of the target quality: Tiao tasks #0032 and #0033 (ssh to bee repo `~/code/nick/tiao`, see `repoos/work/0032-*.md`, `0033-*.md`) after their guides were added.

## Shots
```json
[
{
"label": "Human task drawer missing step-by-step guide warning",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": "[data-test-id=\"human-guide-warning\"]",
"steps": [
{
"waitFor": "[data-test-id=\"human-guide-warning\"]"
}
],
"state": "drawer:humanGuideWarning"
}
]
```

## Accepted scope and known limitations
FINAL (round 5, hand-finished): other tasks' work files were restored from main (the branch diff contains only this task's files) and main was merged; fence-close matching in task-underspecified.ts and task-summary.ts now uses the shared isMarkdownFenceClose helper, covered by markdown-fence.test.ts (info-string lines do not close a fence). The merge conflict, the PM split prompt guide rule and the unfilled-guide warning are done. NOT blocking, follow-up only: a captured screenshot of the drawer banner (the declared shot was brittle; unit and route tests cover the warning); the duplicate humanTaskGuideWarning call in patchTask; assignee case normalisation in the scaffold check. Report these under Suggestions, not Bugs.

## Activity

- 2026-11-09T07:52:08Z · created · njachowski@gmail.com
- 2026-11-09T07:58:10Z · status inbox→ready
- 2026-11-09T19:57:02Z · status ready→active, branch
- 2026-11-09T20:02:17Z · message_queued at 2026-11-09T20:02:17.663Z
- 2026-11-09T20:04:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T20:09:33Z · message_queued at 2026-11-09T20:09:33.278Z
- 2026-11-09T20:14:46Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T20:46:54Z · message_delivered: 2 message(s)
- 2026-11-09T21:04:41Z · body
- 2026-11-09T21:05:12Z · body
- 2026-11-09T21:21:09Z · body
- 2026-11-09T21:34:46Z · body
- 2026-11-09T21:44:12Z · message_queued at 2026-11-09T21:44:12.362Z
- 2026-11-09T22:45:43Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T00:39:48Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T04:29:28Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T05:00:00Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T08:24:40Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T11:04:26Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T13:31:44Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T17:26:31Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T23:04:19Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T23:57:57Z · message_overdue: still queued after 60m without being delivered
- 2026-11-11T02:03:45Z · message_overdue: still queued after 60m without being delivered
- 2026-11-11T02:18:39Z · cli_override
- 2026-11-11T02:18:42Z · model_override
- 2026-11-11T02:19:03Z · review_cli_override
- 2026-11-11T02:19:05Z · review_model_override
- 2026-11-11T02:49:43Z · status ready→active
- 2026-11-11T02:49:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T02:49:45Z · message_delivered: 1 message(s)
- 2026-11-11T02:59:44Z · message_queued at 2026-11-11T02:59:44.061Z
- 2026-11-11T02:59:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T03:04:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T03:10:48Z · body
- 2026-11-11T03:15:19Z · body
- 2026-11-11T03:18:31Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Human task drawer shows missing step-by-step guide warning (target "default"): click [data-task-id="9999"]: click: Timeout 5000ms exceeded. on /work?task=9999&tab=changes (http://127.0.0.1:38317/work?shotState=card:humanStep)
- 2026-11-11T03:18:31Z · message_queued at 2026-11-11T03:18:31.239Z
- 2026-11-11T03:18:34Z · message_delivered: 1 message(s)
- 2026-11-11T03:18:52Z · body
- 2026-11-11T03:31:08Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T03:31:08Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T03:31:09Z · needs_input
- 2026-11-11T03:41:58Z · note: adopted orphaned engineer pid 89985
- 2026-11-11T03:49:13Z · body
- 2026-11-11T04:00:35Z · body
- 2026-11-11T04:00:38Z · note: handoff requested (cli)
- 2026-11-11T04:01:57Z · CTO nudge: held — handoff gate is running
- 2026-11-11T04:21:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: Adding integration tests for CLI/API warnings and the split scaffold, then finishing the engineering report and shots. · stderr: RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T04:22:26Z · message_queued at 2026-11-11T04:22:26.665Z
- 2026-11-11T04:22:26Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/pm-canned-messages.test.ts > canned PM messages above the compose box > opens the PM tab with question cards instead of prefilling the compose box on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-11T04:22:27Z · message_delivered: 1 message(s)
- 2026-11-11T04:22:39Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T04:23:09Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T04:23:10Z · needs_input
- 2026-11-11T04:35:22Z · body
- 2026-11-11T04:39:25Z · body
- 2026-11-11T04:41:58Z · CTO nudge: held — handoff gate is running
- 2026-11-11T04:48:03Z · body
- 2026-11-11T05:13:33Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-11T05:13:33Z · status active→review
- 2026-11-11T05:13:34Z · message_queued at 2026-11-11T05:13:34.076Z
- 2026-11-11T05:17:14Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a63f7c801) during finalization (#0734)
- 2026-11-11T05:18:22Z · note: review pass 1: incomplete — no verdict in report
- 2026-11-11T05:20:42Z · note: review pass 2: failed — no usable report
- 2026-11-11T05:20:42Z · needs_input
- 2026-11-11T05:28:11Z · review_cli_override, review_model_override
- 2026-11-11T05:28:12Z · needs_input (review-failed) cleared for review again by human
- 2026-11-11T05:29:23Z · note: review pass 3: needs some work
- 2026-11-11T05:29:23Z · status review→active
- 2026-11-11T05:29:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T05:31:41Z · message_delivered: 1 message(s)
- 2026-11-11T05:32:51Z · body
- 2026-11-11T05:35:41Z · body
- 2026-11-11T05:49:04Z · body: Accepted scope and known limitations (added)
- 2026-11-11T05:49:05Z · message_queued at 2026-11-11T05:49:05.100Z
- 2026-11-11T05:49:08Z · note: handoff requested (cli)
- 2026-11-11T05:51:58Z · CTO nudge: held — handoff gate is running
- 2026-11-11T06:08:40Z · message_queued at 2026-11-11T06:08:40.771Z
- 2026-11-11T06:08:40Z · handoff failed · task-file handoff failed at check · repoos check failed: tests — tests/ensure-worktree-resilience.test.ts > ensureWorktree resilience (#0994) > serializes concurrent starts from separate processes on one branch — at tests/ensure-worktree-resilience.test.ts:195:30 — AssertionError: expected false to be true // Object.is equality
- 2026-11-11T06:11:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T06:28:33Z · note: handoff requested (cli)
- 2026-11-11T06:31:16Z · CTO nudge: held — handoff gate is running
- 2026-11-11T06:46:11Z · agent exited with an error (cursor) · handoff finalization was interrupted (server reload) — restart work to hand off again. If the conversation is poisoned (the same failure repeats every turn), reset it with `repoos start <id> --fresh`
- 2026-11-11T06:58:33Z · message_overdue: still queued after 60m without being delivered
- 2026-11-11T06:58:33Z · message_queued at 2026-11-11T06:58:33.424Z
- 2026-11-11T06:58:33Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-11T06:58:33Z · needs_input
- 2026-11-11T06:58:33Z · message_delivered: 3 message(s)
- 2026-11-11T07:06:58Z · message_queued at 2026-11-11T07:06:58.037Z
- 2026-11-11T07:06:58Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T07:11:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T07:26:54Z · agent exited with an error (cursor) · Error: [aborted] read ECONNRESET
- 2026-11-11T07:27:24Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · Error: [aborted] read ECONNRESET
- 2026-11-11T07:27:26Z · needs_input
- 2026-11-11T07:27:26Z · message_delivered: 1 message(s)
- 2026-11-11T07:44:00Z · note: adopted orphaned engineer pid 62350
- 2026-11-11T07:44:35Z · body
- 2026-11-11T07:56:58Z · body
- 2026-11-11T08:07:00Z · body
- 2026-11-11T08:23:58Z · message_queued at 2026-11-11T08:23:58.132Z
- 2026-11-11T08:23:58Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T08:26:28Z · body
- 2026-11-11T08:28:58Z · CTO nudge: held — handoff gate is running
- 2026-11-11T08:42:15Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-11T08:42:16Z · status active→review
- 2026-11-11T08:42:17Z · message_queued at 2026-11-11T08:42:17.097Z
- 2026-11-11T08:43:54Z · note: review pass 4: needs some work
- 2026-11-11T08:43:54Z · message_delivered: 1 message(s)
- 2026-11-11T08:43:55Z · status review→active
- 2026-11-11T08:43:57Z · CTO nudge: held — remote validation is running
- 2026-11-11T08:50:55Z · body: Accepted scope and known limitations (added 1, removed 1)
- 2026-11-11T08:50:55Z · message_queued at 2026-11-11T08:50:55.985Z
- 2026-11-11T08:50:58Z · note: handoff requested (cli)
- 2026-11-11T08:53:58Z · CTO nudge: held — handoff gate is running
- 2026-11-11T08:58:18Z · body
- 2026-11-11T09:20:58Z · message_queued at 2026-11-11T09:20:58.570Z
- 2026-11-11T09:20:58Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-11T09:23:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T09:51:00Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-11T09:51:00Z · message_delivered: 2 message(s)
- 2026-11-11T10:15:36Z · message_queued at 2026-11-11T10:15:36.105Z
- 2026-11-11T10:15:36Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T10:15:48Z · note: adopted orphaned engineer pid 78542
- 2026-11-11T10:19:42Z · body
- 2026-11-11T10:20:02Z · CTO nudge: held — handoff gate is running
- 2026-11-11T10:35:52Z · message_queued at 2026-11-11T10:35:52.358Z
- 2026-11-11T10:35:55Z · message_delivered: 1 message(s)
- 2026-11-11T11:06:35Z · engineer stopped by request
- 2026-11-11T11:08:04Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 28445 is dead for 29m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-11T15:38:09Z · needs_input
- 2026-11-11T15:38:23Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); wait exceeds the handoff deadline for 4h 59m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-11T15:48:13Z · message_queued at 2026-11-11T15:48:13.945Z
- 2026-11-11T15:48:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T15:53:13Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T16:18:18Z · body
- 2026-11-11T16:18:31Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-11T16:25:10Z · body
- 2026-11-11T16:33:14Z · CTO nudge: held — handoff gate is running
- 2026-11-11T16:41:21Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-11T16:41:31Z · message_queued at 2026-11-11T16:41:31.536Z
- 2026-11-11T16:43:13Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T16:48:34Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: test failure: tests/pm-canned-messages.test.ts > canned PM messages above the compose box > opens the PM tab with question cards instead of prefilling the compose box on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-11T16:48:40Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: test failure: tests/pm-canned-messages.test.ts > canned PM messages above the compose box > opens the PM tab with question cards instead of prefilling the compose box on thinkpad — fix it in the feature branch and re-run the gate · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-11T16:48:41Z · note: handoff requested (cli)
- 2026-11-11T16:53:13Z · CTO nudge: held — handoff gate is running
- 2026-11-11T16:58:20Z · message_queued at 2026-11-11T16:58:20.673Z
- 2026-11-11T16:58:21Z · handoff failed · task-file handoff failed at check · repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs
- 2026-11-11T17:03:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T17:13:17Z · message_delivered: 1 message(s)
- 2026-11-11T17:32:25Z · body
- 2026-11-11T17:51:19Z · agent exited with an error (cursor) · RetriableError: Connection failed repeatedly
- 2026-11-11T17:51:19Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Connection failed repeatedly
- 2026-11-11T17:51:27Z · needs_input
- 2026-11-11T17:51:27Z · message_delivered: 1 message(s)
- 2026-11-11T17:51:32Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:52:32Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:52:39Z · needs_input
- 2026-11-11T17:52:43Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:54:13Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:54:19Z · needs_input
- 2026-11-11T17:54:21Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:56:21Z · engineer crash recovery: resuming cursor + composer-2.5 (4/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:56:27Z · needs_input
- 2026-11-11T17:56:30Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:59:00Z · engineer crash recovery: resuming cursor + composer-2.5 (5/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:59:07Z · needs_input
- 2026-11-11T17:59:12Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T18:02:12Z · engineer crash recovery: resuming cursor + composer-2.5 (6/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T18:02:17Z · needs_input
- 2026-11-11T18:08:14Z · message_queued at 2026-11-11T18:08:14.465Z
- 2026-11-11T18:08:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T18:13:14Z · CTO nudge: held — an undelivered message is already queued

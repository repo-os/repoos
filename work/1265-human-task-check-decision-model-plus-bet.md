---
id: "1265"
title: "Human-task check: decision model plus better keyword rules"
type: feature
status: active
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 5384b92b
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: feat/human-task-check-decision-model-plus-bet
created_at: "2026-11-20T02:34:13Z"
updated_at: "2026-11-23T08:52:28Z"
---
## Problem
When a task starts, RepoOS scans the acceptance criteria for keywords such as "device", "physical", "credentials", "accounts" and "third-party registration". On a match it refuses the start with `needs_input_reason: needs-human-step` and asks for a split. The match is purely lexical, so it gives false positives and agents end up rewording criteria to dodge it, which defeats its purpose.

Example hit on the Tiao board (task #0175, Passports page, 2026-11-20): the criterion "The lock gate (BiometricPrompt with screen-lock fallback) and FLAG_SECURE are covered by unit tests and a note; no physical-device step is required." was refused (matched: "device verification"), and the earlier wording "Biometric or device credential gate and FLAG_SECURE verified (test or scene plus note)" was refused too (matched: "credentials or keys"). Everything in them is agent-doable and testable, and the second one even says no physical step is needed. The start only went through after rewording both lines to avoid the words.

## Desired UX
1. A decision-model check, as a new setting. Add a setting (suggested key `humanTaskCheck.mode` = `keywords` | `model` | `both`, default `both`) that lets a small decision model judge whether an acceptance criterion needs a human step. A human step is a real physical phone or other hardware, a real account or sign-up, secrets or credentials the agent cannot hold, a third-party registration, or a judgment only a person can make. Merely mentioning such words does not count (unit-testing a biometric gate; "no physical-device step is required").
- Input: the task's acceptance criteria and notes. Output: a structured verdict per criterion (`human_needed` true/false, a one-line reason, a quote of the offending text) plus an overall result.
- Mode `both` runs the keywords first and consults the model only on a keyword hit, so cost stays near zero for tasks with no hit. The model may overrule a false keyword hit, and the log says that it did.
- Fail safe: if the model errors or times out, fall back to the keyword result and say so in the refusal text. Cache the verdict by task content hash so a restart does not re-ask.
- When it refuses, the message quotes the criterion and the reason so the author knows what to change or split.
2. Better keyword rules, with or without the model.
- Move the keyword list into config, editable in Settings, with sensible defaults.
- Match phrases and context, not bare words. Ignore negations ("no physical-device step is required", "without a real account") and words inside code identifiers or quoted API names (BiometricPrompt, `deviceId`, "device credential fallback").

## Acceptance criteria
- The setting exists in the Settings UI (`getConfigSchema()` and the right Settings tab), in the supported-keys list and in docs/user-docs, with a test.
- Table-driven tests: the two Tiao #0175 criteria above pass, and a set of genuinely human-gated sample phrases (listed in the Notes) are still caught.
- Tests use a fake model; a model error falls back to keywords with a visible note.
- Each model call is recorded in the `sessions` table via `recordOneShotSession` with a legible `sessionType` (for example `human-check`).
- The refusal message quotes the criterion and the reason.

## Notes for AI
Find the check by searching for `needs-human-step` and the "mention a real device, physical hardware, accounts, credentials" message. Make the model a configurable agent role chosen from the budget allowlist: a cheap model (Haiku or a cheap opencode model), never Sonnet, no hard-coded provider. Follow AGENTS.md: Settings control for every user-facing setting, usage recording for every LLM call, docs updated.

Sample phrases that must still be caught: "verify on a real handset", "needs a sign-up at a third party", "the user pastes their secret key".

## Shots
```json
[
{
"label": "Human-task check mode and phrase settings",
"target": "default",
"route": "/agents?tab=model-routing",
"highlight": "[data-testid=\"human-task-check-mode\"]"
}
]
```

## Activity

- 2026-11-20T02:34:13Z · created · t@t
- 2026-11-20T02:34:19Z · needs_input
- 2026-11-20T02:34:38Z · body: Acceptance criteria (added 1, removed 1); Notes for AI (added 1)
- 2026-11-20T02:34:42Z · needs_input
- 2026-11-20T19:50:04Z · status inbox→ready
- 2026-11-22T18:28:05Z · story
- 2026-11-22T18:35:04Z · depends_on
- 2026-11-22T18:35:26Z · story, depends_on
- 2026-11-23T07:33:11Z · status ready→active, branch
- 2026-11-23T07:41:18Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 9249 is dead for 0s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-23T07:44:50Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I did **not complete task #1265** and did not request handoff. The core keyword matcher now avoids the two Tiao false positives, catches the three human-gated examples, and adds a visible note when the model check fails. The focused tests … · stderr: Reading additional input from stdin... 2026-11-23T07:44:50.280922Z ERROR codex_core::session: failed to record rollout items: thread 01a20752-f66e-7811-ae37-9b7752bba68f not found 2026-11-23T07:44:50.281087Z ERROR codex_core::session: failed to record rollout items: thread 01a20752-f66e-7811-ae37-9b7752bba68f not found
- 2026-11-23T07:47:04Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-23T07:50:49Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 35030 is dead for 9m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-23T08:00:52Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-23T08:00:58Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 35988 is dead for 19m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-23T08:03:08Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-23T08:10:09Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 68774 is dead for 28m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-23T08:18:09Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-23T08:24:48Z · message_queued at 2026-11-23T08:24:48.646Z
- 2026-11-23T08:24:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-23T08:27:54Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-23T08:27:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The local fallback completed and found formatting issues in five edited files; lint and the documentation build passed, while build and tests were skipped because formatting failed. I’ll run the repository formatter, then rerun the require… · stderr: Reading additional input from stdin... 2026-11-23T08:05:47.731692Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/human-task-check-decision-model-plus-bet/src/core/config.ts: export const SUPPORTED_TOML_KEYS = [
- 2026-11-23T08:27:54Z · message_delivered: 1 message(s)
- 2026-11-23T08:29:48Z · message_queued at 2026-11-23T08:29:48.518Z
- 2026-11-23T08:29:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-23T08:34:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-23T08:35:47Z · body
- 2026-11-23T08:41:10Z · queued message undelivered for 11m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-23T08:41:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The scoped check committed a WIP checkpoint and is now in remote validation again. The first host failed its throughput probe, so RepoOS is retrying another host. The format, UI build, and focused tests have already passed locally. · stderr: 2026-11-23T08:32:06.160129Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 35154 2026-11-23T08:34:09.939879Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/human-task-check-decision-mode…
- 2026-11-23T08:41:11Z · message_delivered: 1 message(s)
- 2026-11-23T08:44:48Z · message_queued at 2026-11-23T08:44:48.509Z
- 2026-11-23T08:44:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-23T08:46:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-23T08:47:30Z · note: adopted orphaned engineer pid 45657
- 2026-11-23T08:48:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-23T08:49:13Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-23T08:49:28Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: Two remote runners were skipped because their network probes fell below RepoOS’s throughput floor. The check is moving through its retry path; I’m continuing to wait for a pass or a definitive failure. · stderr: 2026-11-23T08:41:12.742568Z ERROR codex_core::util: Custom tool call output is missing for call id: call_82dc13779db54460804dacf158925dc5 2026-11-23T08:41:20.006203Z ERROR codex_core::util: Custom tool call output is missing for call id: call_82dc13779db54460804dacf158925dc5
- 2026-11-23T08:49:28Z · message_delivered: 1 message(s)
- 2026-11-23T08:52:28Z · message_queued at 2026-11-23T08:52:28.385Z
- 2026-11-23T08:52:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity

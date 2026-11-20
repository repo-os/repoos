---
id: "1265"
title: "Human-task check: decision model plus better keyword rules"
type: feature
status: ready
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 5384b92b
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-20T02:34:13Z"
updated_at: "2026-11-20T19:50:04Z"
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

## Activity

- 2026-11-20T02:34:13Z · created · t@t
- 2026-11-20T02:34:19Z · needs_input
- 2026-11-20T02:34:38Z · body: Acceptance criteria (added 1, removed 1); Notes for AI (added 1)
- 2026-11-20T02:34:42Z · needs_input
- 2026-11-20T19:50:04Z · status inbox→ready

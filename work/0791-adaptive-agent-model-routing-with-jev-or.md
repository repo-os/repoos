---
id: "0791"
title: Adaptive agent/model routing with Jev or Clef-Flash
type: feature
status: done
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 3a709585
priority: p2
area: [agent, server, core, web]
merged_commit: 7bbc48374e704aca0844404d313378d089d45146
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/adaptive-agent-model-routing-with-jev-or
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
created_at: "2026-10-15T07:09:55Z"
updated_at: "2026-10-22T07:47:58Z"
last_close_out_gate_ms: 374967
last_close_out_gate_at: "2026-10-15T11:52:46.772Z"
review_passes: 6
review_rounds: 2
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem
RepoOS currently chooses configured role defaults or explicit task overrides. Add an optional decision-model router that chooses a coding-agent/model configuration for PM, engineer and reviewer runs, and reconsiders that choice when review sends work back. Use task context and measured historical outcomes to reduce total cost and time to an accepted result while preserving quality and the existing lifecycle.

## Scope and design
- Support BOTH TypeSafe Jev and Cloudflare Clef-Flash through a small provider-neutral decision interface. The user selects either provider; switching must not require code changes. Verify current official request/response contracts and model IDs when implementing. Use built-in fetch; preserve zero runtime dependencies.
- Add a documented repoos.toml configuration section for routing: off/shadow/automatic mode, provider/model, credential reference, enabled roles, decision timeout and calibrated fallback policy. Default off; recommend shadow mode for initial evaluation. Never commit API secrets; reuse existing provider secret storage/environment conventions.
- Expose every user-facing feature setting through getConfigSchema() and a designed Model routing section/tab on the Agents page (or the appropriate Settings tab, with a clear link from Agents). Include provider selection for Jev/Clef-Flash, role controls, mode, credential status/test connection, fallback behavior and understandable help text. Persist and reload consistently with TOML. Use shared dropdowns/dialogs and existing design tokens.
- Invoke routing before PM, engineer and reviewer runs, including PM flows that create a task before a task ID exists. Route a complete valid configuration (harness/CLI + model + supported reasoning setting), not independent fields that could form an invalid pair. Honor explicit human pins first; keep router decisions separate from human overrides so future rounds can be reconsidered.
- Deterministically filter candidates against the human-approved budget allowlist, role/tool capabilities, installed/authenticated harnesses, context support and known availability. Reuse canonical role resolution and validation. The router cannot expand permissions or budgets. With no candidates, provider failure, malformed/unsupported response, timeout or insufficient evidence, use an eligible configured fallback or report a clear actionable block; never select a forbidden pair or silently disable review.
- Build a bounded context brief: task/input/story, role, relevant code/context-pack excerpts and architecture constraints, scope/risk, current diff for review, prior findings and attempts, and relevant historical results. Do not send the entire codebase or all transcripts by default. Treat task/code text as data, not instructions to change routing policy.
- Ask atomic, well-defined questions (ambiguity, risk, scope, candidate suitability) and combine their signals with cost/time policies in code. Returned confidence is not established real-world accuracy; calibrate on RepoOS examples and provide an explicit insufficient-evidence path. Version question schemas and routing policies.
- Re-evaluate on review handback using actual findings, prior attempts and failure category. Compare continuing the existing session (context reuse) with switching/escalating. Do not penalize coding models for infrastructure, provider or gate setup failures. Bound retries/escalations and respect pause, locks, live-run coordination and the existing review/close-out flow. Coordinate with #0767 centralized recovery rather than introducing a competing recovery loop.

## Outcomes and observability
- Persist each routing decision: task or input correlation, role/round, eligible candidate set, selected configuration, probabilities/scores, applied policy factors, provider/model/schema version, timing, fallback reason and bounded reproducible context reference. Show shadow recommendation versus actual selection and subsequent outcome in the UI. Do not fabricate a free-text explanation that the provider never produced; render explanations from recorded factors.
- Record every decision call's usage/cost/time in the sessions system (including board-level/PM calls with taskId null); extend the established accounting path as needed. Missing dollar costs remain unknown; preserve different billing units and distinguish measured from estimated values.
- Link execution sessions and decisions to task/round outcomes: checks, substantive reviewer findings, rework rounds, human intervention/acceptance and final completion. A clean process exit or permissive reviewer is not proof of quality. Optimize total cost/time to accepted completion, including routing overhead and retries, subject to quality constraints.
- Retrieve comparable recent examples with sample counts and model/harness versions. Account for harder tasks historically going to stronger models; historical outcomes alone cannot establish which untried option would have been better. No claim of automatic learning merely from logging or passing history into context.
- Include an evaluation/report path comparing Jev, Clef-Flash, current defaults and a simple deterministic routing baseline on frozen representative briefs. Start in shadow mode; allow explicit opt-in automatic routing with per-role/low-risk limits. Assess quality, rework, total cost/time, fallback rate and calibration; avoid future-outcome leakage in replay evaluation. Any controlled exploration must be opt-in and remain within the approved candidate/budget set. Fine-tuning and a full bandit optimizer are follow-up work, not prerequisites.

## Acceptance criteria
- Both providers work behind the same adapter contract, with fixture-backed API tests and an optional credentialed smoke test; provider switching round-trips through TOML and the UI. Missing credentials are visible and do not break normal role execution.
- Coverage demonstrates off mode preserves existing behavior, shadow mode never changes the actual selection, and automatic mode respects pins, role capabilities and allowlists for all three roles. Cover empty/singleton candidates, unavailable providers, invalid/low-confidence responses, timeouts, unknown costs and restart-safe decision records.
- A review-handback scenario demonstrates continuation versus escalation using findings and attempt history, with bounded retries and correct classification of infrastructure failures. No bypass of review, checks, approval or close-out; no mutation of a reviewed worktree.
- UI tests cover configuration persistence and decision/outcome display; rebuild and verify the UI. Update directly affected docs and user-docs with setup for BOTH providers, secret handling, shadow evaluation, automatic mode, fallbacks and limitations.
- Run scoped repoos check before handoff; normal RepoOS review and close-out apply. No live paid evaluation runs are required merely to pass the automated suite.

## Starting points and references
- src/server/agents.ts: resolveAgentForTask, resolveReviewerForTask, mergeAgentOverride, recordOneShotSession and session accounting.
- src/server/agent-model-allowlist.ts and src/core/budget-allowlist.ts: candidate budget enforcement.
- src/server/auto-engineering.ts: existing deterministic task scheduling and decision records; distinguish task scheduling from selecting the model for a role.
- Existing context packs, config schema, provider credential handling, session DB and Agents/Budget Controls UI should be reused.
- https://docs.typesafe.ai/introduction
- https://huggingface.co/Cloudflare/clef-flash
- https://blog.cloudflare.com/clef-decision-models/

## Phase 1 (this branch)
Delivers the provider-neutral routing **foundation** in `src/core/model-routing/`: System One codec; direct Jev, OpenRouter System One, and self-hosted Clef-Flash adapters; `[model_routing]` parsing and `getConfigSchema()` keys; candidate filter, policy, and `decideRoutingForRun` (fixture-tested); `user-docs/configuration.md` including OpenRouter as a distinct provider.

**Follow-ups:** Agents UI + shadow wiring (#0792), automatic run-path + handback (#0793), live credentialed smoke (#0794).

## Activity

- 2026-10-15T07:09:55Z · created · njachowski@gmail.com
- 2026-10-15T07:09:55Z · needs_input
- 2026-10-15T07:10:06Z · needs_input
- 2026-10-15T07:24:13Z · cli_override, model_override
- 2026-10-15T07:24:16Z · cli_override
- 2026-10-15T07:31:05Z · model_override
- 2026-10-15T07:31:08Z · status inbox→ready
- 2026-10-15T07:31:10Z · status ready→active, branch
- 2026-10-15T07:31:11Z · needs_input
- 2026-10-15T07:35:34Z · body
- 2026-10-15T07:36:24Z · body
- 2026-10-15T07:38:20Z · body
- 2026-10-15T07:45:40Z · needs_input
- 2026-10-15T07:51:37Z · message_queued at 2026-10-15T07:51:37.753Z
- 2026-10-15T07:51:37Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T07:51:58Z · body
- 2026-10-15T07:58:14Z · handoff failed · remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T08:04:05Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-15T08:04:05Z · note: handoff requested (cli)
- 2026-10-15T08:07:23Z · message_queued at 2026-10-15T08:07:23.434Z
- 2026-10-15T08:09:47Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on bee — fix it in the feature branch and re-run the gate
- 2026-10-15T08:17:11Z · model_override
- 2026-10-15T08:18:07Z · needs_input
- 2026-10-15T08:18:08Z · message_delivered: 2 message(s)
- 2026-10-15T08:18:38Z · needs_input
- 2026-10-15T08:18:39Z · message_queued at 2026-10-15T08:18:39.179Z
- 2026-10-15T08:19:09Z · body
- 2026-10-15T08:23:25Z · body: section Phase 1 (this branch)
- 2026-10-15T08:24:01Z · body: section Phase 1 (this branch)
- 2026-10-15T08:25:20Z · body
- 2026-10-15T08:27:21Z · body
- 2026-10-15T08:35:40Z · status active→review
- 2026-10-15T08:35:41Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-10-15T08:35:42Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-15T08:36:39Z · note: review pass 1: needs some work
- 2026-10-15T09:44:23Z · review_cli_override
- 2026-10-15T09:47:14Z · needs_input
- 2026-10-15T09:47:31Z · status review→active
- 2026-10-15T09:47:42Z · needs_input
- 2026-10-15T09:54:49Z · body
- 2026-10-15T09:56:13Z · status active→review
- 2026-10-15T09:56:13Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-10-15T09:56:14Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-15T09:58:30Z · note: review pass 2: needs some work
- 2026-10-15T09:58:30Z · status review→active
- 2026-10-15T10:06:31Z · body
- 2026-10-15T10:15:23Z · status active→review
- 2026-10-15T10:15:24Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-10-15T10:15:24Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-15T10:17:12Z · note: review pass 3: needs some work
- 2026-10-15T10:17:12Z · status review→active
- 2026-10-15T10:24:22Z · body
- 2026-10-15T10:31:24Z · status active→review
- 2026-10-15T10:31:24Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-10-15T10:31:25Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-15T10:33:36Z · note: review pass 4: needs some work
- 2026-10-15T10:33:37Z · needs_input
- 2026-10-15T10:43:43Z · status review→active
- 2026-10-15T10:43:57Z · needs_input
- 2026-10-15T10:52:42Z · message_queued at 2026-10-15T10:52:42.902Z
- 2026-10-15T10:52:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T10:53:17Z · body
- 2026-10-15T11:00:08Z · body
- 2026-10-15T11:00:59Z · body
- 2026-10-15T11:02:27Z · status active→review
- 2026-10-15T11:02:28Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-15T11:03:01Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-10-15T11:04:09Z · note: review pass 5: needs some work
- 2026-10-15T11:04:09Z · needs_input
- 2026-10-15T11:08:37Z · status review→active
- 2026-10-15T11:08:47Z · needs_input
- 2026-10-15T11:33:04Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-15T11:33:04Z · status active→review
- 2026-10-15T11:33:05Z · note: handoff requested (cli)
- 2026-10-15T11:39:24Z · body
- 2026-10-15T11:41:30Z · status active→review
- 2026-10-15T11:41:30Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-10-15T11:41:32Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-15T11:45:17Z · note: review pass 6: good to go
- 2026-10-15T11:52:46Z · close-out gate completed in 375s
- 2026-10-15T11:53:14Z · status review→done, release:success
- 2026-10-15T11:53:24Z · needs_input
- 2026-10-22T07:47:58Z · needs_input

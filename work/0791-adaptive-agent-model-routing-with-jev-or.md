---
id: "0791"
title: Adaptive agent/model routing with Jev or Clef-Flash
type: feature
status: inbox
priority: p2
area: [agent, server, core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
model_override: default
created_at: "2026-10-15T07:09:55Z"
updated_at: "2026-10-15T07:24:16Z"
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

## Activity

- 2026-10-15T07:09:55Z · created · njachowski@gmail.com
- 2026-10-15T07:09:55Z · needs_input
- 2026-10-15T07:10:06Z · needs_input
- 2026-10-15T07:24:13Z · cli_override, model_override
- 2026-10-15T07:24:16Z · cli_override

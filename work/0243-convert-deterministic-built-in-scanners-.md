---
id: "0243"
title: Convert deterministic built-in scanners into configurable AI agents
type: feature
status: active
needs_input: true
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/convert-deterministic-built-in-scanners-
cli_override: qwen code
model_override: default
pm_model_override: default
created_at: "2026-08-17T07:16:50Z"
updated_at: "2026-08-24T17:20:56Z"
check_retry_count: 1
---
## Problem
Tech Debt, Performance, Architect, and Design are currently deterministic rule-based scanners. They are fast but cannot reason about repository intent, runtime behavior, or product context; their fixed heuristics also create false positives.

## Goal
Convert each scanner into a real AI agent with its own configurable coding CLI and model. Preserve lightweight deterministic checks only as optional evidence/pre-filtering, never as the sole diagnosis.

## Scope
- Add persisted per-agent configuration for Tech Debt, Performance, Architect, and Design: enabled, schedule, CLI, model, and instructions.
- Surface CLI/model controls on the Agents page using the available agent/model catalog and validate them server-side.
- Run each agent through the configured coding-agent CLI with role-specific, read-only prompts and bounded repository context.
- Keep outputs appropriate to each role: Tech Debt and Performance may create deduplicated inbox tasks; Architect and Design should produce review reports, with explicit user approval before material writes outside those established outputs.
- Show actionable failures (including unavailable/credit-exhausted models) with a route back to the relevant agent settings.
- Migrate existing built-in-agent enable/schedule/last-run state without losing it.

## Acceptance criteria
- Changing any of the four agents CLI/model persists across reloads and is used on its next run.
- Each agent can complete a read-only analysis using its configured CLI/model.
- Model/connector failures clearly identify the affected agent and offer configuration recovery.
- Existing schedules, manual Run now actions, reports, and task-creation safeguards continue to work.
- Regression tests cover configuration persistence, command selection, success/failure states, and migration from existing scanner settings.

## Activity

- 2026-08-17T07:16:50Z · created · unknown
- 2026-08-18T02:29:09Z · status inbox→ready
- 2026-08-18T03:08:16Z · model_override
- 2026-08-18T03:08:17Z · pm_model_override
- 2026-08-20T10:38:05Z · status ready→active, branch
- 2026-08-20T11:49:27Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-20T12:23:37Z · status ready→active
- 2026-08-22T16:39:11Z · cli_override
- 2026-08-22T16:39:13Z · cli_override
- 2026-08-22T16:39:14Z · cli_override
- 2026-08-22T16:39:15Z · cli_override
- 2026-08-22T16:39:15Z · cli_override
- 2026-08-22T16:39:16Z · cli_override
- 2026-08-22T16:39:43Z · cli_override
- 2026-08-22T16:39:44Z · cli_override
- 2026-08-22T16:39:45Z · cli_override
- 2026-08-22T16:39:46Z · cli_override
- 2026-08-22T16:39:47Z · cli_override
- 2026-08-22T16:39:48Z · cli_override
- 2026-08-23T08:21:47Z · agent exited with an error · error: You have exceeded your monthly quota (Request ID: 2411:1A2E2D:389116:5125A5:6A8AAD98)
- 2026-08-23T11:00:07Z · cli_override
- 2026-08-23T11:00:22Z · status active→ready
- 2026-08-23T11:00:25Z · status ready→active, needs_input
- 2026-08-23T11:02:51Z · agent exited with an error · Error: --resume requires a valid session ID or session title when used with --print. Usage: claude -p --resume <session-id|title>. Provided value "ses_fe1400856ffe1g1BbZRy2sD8Qf" is not a UUID and does not match any session title.
- 2026-08-24T17:20:54Z · cli_override
- 2026-08-24T17:20:55Z · cli_override
- 2026-08-24T17:20:56Z · cli_override

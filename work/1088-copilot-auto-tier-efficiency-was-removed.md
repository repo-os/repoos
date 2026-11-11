---
id: "1088"
title: "Copilot Auto tier 'efficiency' was removed: default github copilot model fails; map to balance and explain tier errors"
type: bug
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/copilot-auto-tier-efficiency-was-removed
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-11T02:58:46Z"
updated_at: "2026-11-11T17:13:15Z"
---
## Problem
The `github copilot` agent now fails its connectivity test (and any run) with: "The `efficiency` Auto profile is no longer available. Set --auto-tier to balance or intelligence." (Copilot CLI 1.0.109.) RepoOS hard-codes the cheapest Auto tier as `efficiency`: `src/server/agents.ts` `modelArgs` maps the model `default` (the only github copilot model on the budget allowlist) to `--model auto --auto-tier efficiency`, and `src/core/agent-contract.ts` maps `copilot-auto-efficiency` the same way (and uses it as the default model for github copilot, ~line 902). The CLI validates the tier up front against the account's catalog ("Auto preference ... is unavailable for this account") and does not list the valid ones; `copilot --help` says `--auto-tier <preference>`: "Set the Auto routing profile by its exact advertised ID (validated against the available catalog)".

## What we know
- GitHub added Efficiency / Balance / Intelligence Auto tiers on 2026-09-14 (changelog: https://github.blog/changelog/2026-09-14-configure-cost-and-quality-in-copilot-auto-model-selection); the CLI error says `efficiency` is gone for this account and `balance` / `intelligence` are the options.
- There is no non-interactive CLI command that lists models: `copilot -p "models"` just asks the model, which describes the interactive `/model` command. The interactive picker (screenshot attached) shows: GPT-5.6 Terra (default), GPT-6 Luna, Claude Sonnet 5.5, GPT-6.1 Terra, GPT-5.6 Luna, GPT-5.3-Codex, Claude Sonnet 5, Claude Haiku 5.5, Claude Haiku 4.5, MAI-Code-1.1-Flash, Gemini 3.8 Flash, Grok 4.7, Grok 4.6, Kimi K3. The exact `--model <id>` strings for these are NOT verified.
- Not verified live: running with `--auto-tier balance` (it spends Copilot AI credits); the verification below should do one tiny probe.

## Acceptance criteria
1. The default `github copilot` model (`default` / `copilot-auto-efficiency`) maps to a tier that exists today: `balance` (cheapest remaining). Keep the `copilot-auto-efficiency` id working as an alias (persisted configs) but map it to balance with a comment, and update the compatibility record.
2. Tiers are not hard-coded as a closed list: when the CLI reports "Auto preference X is unavailable", the agent test and run error show a plain-English message naming the tier and suggesting the valid ones (balance, intelligence), and the Settings agent test explains how to fix it.
3. If it is cheap to do, probe once at agent test time which of balance / intelligence the account accepts (one tiny prompt) and cache the answer; otherwise document it.
4. Do not hard-code the interactive model list unless the exact `--model` ids are verified from CLI output or docs; if added, put it in one data file with a comment naming where it came from.
5. Tests: tier mapping (`default`, `copilot-auto-efficiency`, balance, intelligence) in `agent-drivers.test.ts`; the error-message mapping; no network in tests.
6. Docs: `docs/architecture.md` (~line 379) and `user-docs/agents.md` (~line 186) describe the tiers; update them.

## Notes for AI
Files: `src/server/agents.ts` (~3430), `src/core/agent-contract.ts` (~690, ~900), `src/core/agent-compatibility.json`, `src/ui-app/tests/agent-drivers.test.ts`. Do not edit repoos.toml.

## Screenshots

![Agent test error](/api/tasks/1088/attachments/att_0d8334b5-d76c-456d-842f-19884a7fb81f.png)
![Interactive /model picker](/api/tasks/1088/attachments/att_d1c6b13d-055e-4bca-8721-b22e2432fb13.png)

## Activity

- 2026-11-11T02:58:46Z · created · njachowski@gmail.com
- 2026-11-11T02:58:46Z · screenshots
- 2026-11-11T10:48:12Z · status inbox→ready
- 2026-11-11T10:48:13Z · cli_override, model_override
- 2026-11-11T10:48:13Z · status ready→active, branch
- 2026-11-11T10:55:28Z · message_queued at 2026-11-11T10:55:28.776Z
- 2026-11-11T10:55:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T10:55:47Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T11:06:36Z · engineer stopped by request
- 2026-11-11T11:08:04Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 28445 is dead for 15m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-11T12:03:29Z · message_overdue: still queued after 60m without being delivered
- 2026-11-11T12:08:10Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T15:38:15Z · needs_input
- 2026-11-11T15:38:20Z · message_delivered: 1 message(s)
- 2026-11-11T15:38:23Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); wait exceeds the handoff deadline for 4h 45m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-11T15:54:29Z · body
- 2026-11-11T15:54:42Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-11T16:13:14Z · message_queued at 2026-11-11T16:13:14.062Z
- 2026-11-11T16:13:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T16:15:12Z · body
- 2026-11-11T16:18:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T16:22:59Z · body
- 2026-11-11T16:36:17Z · body
- 2026-11-11T16:36:20Z · body
- 2026-11-11T17:13:15Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered

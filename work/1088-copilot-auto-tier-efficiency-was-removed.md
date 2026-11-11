---
id: "1088"
title: "Copilot Auto tier 'efficiency' was removed: default github copilot model fails; map to balance and explain tier errors"
type: bug
status: review
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/copilot-auto-tier-efficiency-was-removed
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-11T02:58:46Z"
updated_at: "2026-11-11T19:41:29Z"
review_passes: 2
review_rounds: 1
handoff_signal_retry_count: 1
dev_error_count: 6
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
- 2026-11-11T17:13:16Z · message_overdue: still queued after 60m without being delivered
- 2026-11-11T17:13:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: VitePress runs the LLMS enrich hook too early (`closeBundle` before markdown lands in `dist`). Moving enrichment to `buildEnd` so the user-docs build passes the gate. · stderr: (empty)
- 2026-11-11T17:18:34Z · message_queued at 2026-11-11T17:18:34.580Z
- 2026-11-11T17:24:07Z · message_delivered: 1 message(s)
- 2026-11-11T17:40:02Z · body
- 2026-11-11T17:51:34Z · agent exited with an error (cursor) · RetriableError: Connection failed repeatedly
- 2026-11-11T17:51:34Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Connection failed repeatedly
- 2026-11-11T17:51:41Z · needs_input
- 2026-11-11T17:51:41Z · message_delivered: 1 message(s)
- 2026-11-11T17:51:46Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:52:46Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:52:52Z · needs_input
- 2026-11-11T17:52:57Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:54:27Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:54:33Z · needs_input
- 2026-11-11T17:54:36Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:56:36Z · engineer crash recovery: resuming cursor + composer-2.5 (4/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:56:42Z · needs_input
- 2026-11-11T17:56:49Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:59:19Z · engineer crash recovery: resuming cursor + composer-2.5 (5/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T17:59:24Z · needs_input
- 2026-11-11T17:59:27Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T18:02:27Z · engineer crash recovery: resuming cursor + composer-2.5 (6/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-11T18:02:32Z · needs_input
- 2026-11-11T18:08:15Z · message_queued at 2026-11-11T18:08:15.287Z
- 2026-11-11T18:08:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T18:13:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T18:35:02Z · body
- 2026-11-11T18:42:13Z · CTO nudge: held — handoff gate is running
- 2026-11-11T18:44:00Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-11T18:44:09Z · status active→review
- 2026-11-11T18:44:11Z · message_queued at 2026-11-11T18:44:11.240Z
- 2026-11-11T18:45:04Z · note: review pass 1: needs some work
- 2026-11-11T18:45:04Z · message_delivered: 1 message(s)
- 2026-11-11T18:45:05Z · status review→active
- 2026-11-11T18:45:07Z · CTO nudge: held — remote validation is running
- 2026-11-11T19:13:09Z · body
- 2026-11-11T19:28:16Z · message_queued at 2026-11-11T19:28:16.159Z
- 2026-11-11T19:28:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T19:31:26Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T19:38:16Z · CTO nudge: held — handoff gate is running
- 2026-11-11T19:40:16Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-11T19:40:18Z · status active→review
- 2026-11-11T19:40:19Z · message_queued at 2026-11-11T19:40:19.278Z
- 2026-11-11T19:41:28Z · note: review pass 2: needs some work
- 2026-11-11T19:41:29Z · message_delivered: 1 message(s)

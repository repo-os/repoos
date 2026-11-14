---
id: "1122"
title: "GitHub Copilot agent: support the new model picker (GPT-6 Luna, GPT-6.1 Terra, Haiku 5.5 ...) with real --model ids"
type: feature
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: t@t
branch: feat/github-copilot-agent-support-the-new-mod
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-14T17:41:02Z"
updated_at: "2026-11-14T17:59:41Z"
handoff_signal_retry_count: 1
---
## Problem
The `github copilot` agent is effectively unusable. #1088 (landed 2026-11-11) mapped the retired Auto `efficiency` tier to `balance` and made tier errors readable, but the only model RepoOS knows for it is `default`, and the allowlist entry in repoos.toml is still paused ("Waiting for model list fix"). The Copilot CLI (1.0.109) now offers a model picker (screenshot attached) with GPT-5.6 Terra (default), GPT-6 Luna, Claude Sonnet 5.5, GPT-6.1 Terra, Gemini 4 Hydrogen, Claude Haiku 5.5, Grok 4.7, Kimi K3 and others, with per-model reasoning levels. RepoOS cannot select any of them. There is no non-interactive command that lists model ids (#1088 found `copilot -p "models"` only asks the model). `copilot --model <model>` and `--reasoning-effort <none|minimal|low|medium|high|xhigh|max>` exist.

## Desired UX
In Settings, the GitHub Copilot agent offers the real models the CLI accepts (at least GPT-6 Luna, GPT-6.1 Terra and Claude Haiku 5.5, plus Auto), each with the reasoning levels it supports; the connectivity test names the exact model and the failure; a task can be pinned to a Copilot model like any other agent. Copilot runs as a normal fallback when another agent (for example codex) is out of usage.

## Acceptance criteria
1. Discover the valid `--model` ids without spending credits where possible: run `copilot --model <invalid-id> -p x` and read the error (it may list valid ids), check `copilot --help`, `copilot providers`, the CLI config and docs; record the findings and the CLI version in the report. Where a model id can only be confirmed by a real call, do at most one tiny probe per model (single short prompt) and say what it cost.
2. Add the confirmed ids to the model catalog and the allowlist entry for `github copilot` (alongside `default`), keeping the `copilot-auto-efficiency` alias from #1088. Do NOT add Claude Sonnet or Opus models or any "Fusion" option: Nick's standing rule is cheap models only, Haiku or equivalents. Gemini, Grok, Kimi and other models may be listed in the report as available but left out of the allowlist for Nick to choose.
3. Map `--reasoning-effort` for each added model to the levels it reports; reject an unsupported level with a plain-English message naming the model and its valid levels.
4. Update the Settings agent model picker and the agent connectivity test (src/core/agent-contract.ts and the Settings UI) with tests; keep the zero-runtime-dependency rule. Every run records usage per AGENTS.md.
5. Do not unpause the `github copilot` allowlist entry or change any budget setting: report whether a probe of `gpt-6-luna` through Copilot works end to end, and leave the unpause to Nick (`repoos agents resume "github copilot"`).
6. Update user-docs (built-in-agents or configuration) with how to choose a Copilot model, and `repoos check` passes.

## Notes for AI
Read work/1088-*.md and src/core/copilot-auto-tier.ts first. Copilot usage is billed in Copilot AI credits, so keep probes minimal and never loop. Related: #0625 (live Copilot credit data), #0629 (Copilot provider external link only).

## Shots
```json
[
{
  "label": "GitHub Copilot named models in picker",
  "target": "default",
  "route": "/agents",
  "highlight": ".agents-page-title"
}
]
```

## Screenshots

![59](/api/tasks/1122/attachments/att_6b52e009-ddc3-4b00-85c8-8a061a1db607.png)

## Activity

- 2026-11-14T17:41:02Z · created · t@t
- 2026-11-14T17:41:02Z · screenshots
- 2026-11-14T17:41:08Z · cli_override, model_override
- 2026-11-14T17:41:10Z · status inbox→ready
- 2026-11-14T17:41:12Z · status ready→active, branch
- 2026-11-14T17:46:27Z · message_queued at 2026-11-14T17:46:27.053Z
- 2026-11-14T17:48:53Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T17:54:57Z · body
- 2026-11-14T17:56:39Z · queued message undelivered for 10m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T17:56:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Breaking a circular import between the Copilot modules. · stderr: (empty)
- 2026-11-14T17:59:24Z · message_delivered: 1 message(s)
- 2026-11-14T17:59:41Z · body

---
id: "0648"
title: Pin cheap models on the certify flow to keep probe costs low
type: feature
status: inbox
priority: medium
area: core
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-04T11:37:21Z"
updated_at: "2026-10-04T11:37:21Z"
---
## Problem
`repoos certify <cli>` (src/commands/certify.ts → runAdapterContract in src/core/agent-contract.ts) makes 2–3 live model calls per harness (one-shot, resume, cancellation) with the prompt 'Reply with the single word OK.'. Only `pi` receives a model flag today (templates.modelArgs); the other nine harnesses (antigravity, claude code, codex, crush, cursor, github copilot, kiro, opencode, qwen code) run on whatever their configured default is — possibly a flagship model. Certifying all ten can cost real money for no benefit.

## Desired UX
- Each harness has a pinned cheap default model for the certify/probe flow, used unless `--model <id>` is passed. Print the model actually used in the probe output and in the manifest's verificationSource.
- Add `modelArgs` to each harness's CONTRACT_TEMPLATES entry (reuse the shapes in modelArgs() in src/server/agents.ts, incl. github copilot Auto efficiency tier and pi's provider/model split). Where a CLI has no model flag (e.g. kiro, crush?) say so and document how its default is chosen.
- Suggested starting picks (verify availability per CLI): claude code → Haiku 4.5; opencode → deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731; pi → openrouter/deepseek/deepseek-v4.1-flash; github copilot → Auto efficiency; codex/antigravity/qwen code/cursor → smallest mini/flash tier; kiro/crush → harness default or small configured model.
- Keep the Debugger's own configured model separate: the Debugger default in agents.ts is a code default and can be overridden per user in the Agents page.

## Acceptance criteria
- certify and doctor --probe use the pinned cheap model by default for every harness that supports a model flag, with fixture tests proving the argument shapes (src/ui-app/tests/agent-contract.test.ts).
- --model still overrides.
- docs/agent-compatibility.md and user-docs/coding-harness-compatibility.md document the defaults and cost expectations.

## Notes for AI
Related: certify now skips already-certified versions unless --force.

## Activity

- 2026-10-04T11:37:21Z · created · unknown

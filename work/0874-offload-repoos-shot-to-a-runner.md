---
id: "0874"
title: Offload repoos shot to a runner
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "error: Upstream request failed: Endpoint is unavailable."
debug_tldr: The LLM provider endpoint was unavailable — retry the agent run or choose another allowlisted model in Budget Controls.
debug_tldr_at: "2026-10-21T08:24:51Z"
debug_tldr_key: "dev-error|error: Upstream request failed: Endpoint is unavailable."
priority: p3
area: [server, core]
depends_on: ["0854"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/offload-repoos-shot-to-a-runner
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:27:49Z"
updated_at: "2026-10-21T08:35:02Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T08:24:31.668Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Parent #0854 offloads the AUTOMATIC handoff shots and UI verification to a remote runner. Manual `repoos shot` / `repoos verify` deliberately STAY LOCAL: the spec was narrowed in #0854 review pass 17, so #0854 does not ship a runner-backed CLI. The interactive CLI keeps using the local PreviewManager / WebKit on the control-plane laptop.

## Desired UX
`repoos shot` / `repoos verify` run their capture on an available runner in the same way the automatic handoff capture does, while still falling back locally when a runner is unavailable.

## Acceptance criteria
- `repoos shot` / `repoos verify` can offload capture to a runner, reusing the canonical capture context (#0854, `src/core/remote-capture.ts`) and the browser-capture policy/fallback rules.
- `runner-available` falls back locally with a visible note; `runner-only` returns a structured error (never throws).
- Tests: runner-backed CLI capture succeeds, falls back locally, and returns the structured error in runner-only.

## Notes for AI
Not required for #0854's acceptance criteria. #0864 (rebuild the runner image and record a real end-to-end proof) is separate and out of scope here. Source: #0854 review pass 17.

## Activity

- 2026-10-20T12:27:49Z · created · njachowski@gmail.com
- 2026-10-20T12:27:52Z · needs_input
- 2026-10-20T12:28:31Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-20T13:22:47Z · needs_input
- 2026-10-21T08:22:46Z · status inbox→ready
- 2026-10-21T08:22:50Z · cli_override, model_override
- 2026-10-21T08:22:51Z · status ready→active, branch
- 2026-10-21T08:24:31Z · agent exited with an error (opencode) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T08:24:31Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T08:35:02Z · body

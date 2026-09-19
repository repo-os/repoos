---
id: "0442"
title: "Agent runner: recover partial output on unterminated JSON in stream"
type: bug
status: active
priority: p2
area: ai
assigned_to: ai
created_by: ""
branch: feat/agent-runner-recover-partial-output-on-u
cli_override: opencode
model_override: openrouter/tencent/hy4-preview
review_model_override: openrouter/xiaomi/mimo-v2.5
created_at: "2026-09-19T08:15:21Z"
updated_at: "2026-09-19T10:39:54Z"
---
## Problem

When an agent CLI (opencode, Claude CLI, or similar) produces a streaming JSON output that gets truncated mid-serialisation — e.g. due to hitting a context limit or buffer overflow — the agent runner's stream parser throws a \`SyntaxError: Unterminated string in JSON\` and silently drops the entire turn's output. The agent session appears to hang or produce no result, and the human gets no actionable error.

Observed on task #0440 (2026-09-19) with opencode/Copilot: \`Unterminated string in JSON at position 284447\` — the payload was ~284KB, consistent with a large tool-call response hitting a serialisation limit.

This is not Copilot-specific. Any agent CLI using a streaming JSON protocol can hit it if a single tool call or response grows large enough.

## Current behaviour

The stream parser calls \`JSON.parse()\` on each line/chunk. On a truncated payload it throws, the error is logged as \`warn\`, and the turn produces zero output. The agent then reports itself blocked with "tool-call formatting issue" and asks for a fresh start — a confusing, misleading message.

Relevant code: \`src/server/agents.ts\` (stream parsing / \`extractOneShotReportText\`) and \`src/server/built-in-agent-runner.ts\`.

## Desired behaviour

1. **Catch truncation errors at the stream level.** Wrap the JSON parse in a try/catch; on \`SyntaxError\`, attempt to recover all complete events that arrived before the truncation point.
2. **Surface a clear error.** If partial recovery is not possible, fail the turn with an explicit message: "Agent output was truncated (payload too large — \`N\` bytes). Retry or reduce context." Not a generic "tool-call formatting issue".
3. **Preserve partial output.** If some complete events were parsed before the truncation, use them rather than discarding the whole turn.

## Acceptance criteria

- [ ] A truncated JSON stream does not silently drop all output
- [ ] The error message distinguishes truncation from other JSON parse failures
- [ ] Partial events before the truncation point are preserved and returned
- [ ] A unit test covers the truncated-stream path

## Activity

- 2026-09-19T08:15:21Z · created · unknown
- 2026-09-19T08:18:14Z · cli_override
- 2026-09-19T08:18:15Z · cli_override
- 2026-09-19T08:18:16Z · cli_override
- 2026-09-19T08:18:17Z · model_override
- 2026-09-19T08:18:22Z · review_model_override
- 2026-09-19T08:18:23Z · status inbox→ready
- 2026-09-19T10:39:54Z · status ready→active, branch

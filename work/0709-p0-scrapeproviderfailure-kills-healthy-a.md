---
id: "0709"
title: "P0: scrapeProviderFailure kills healthy agents on any output line containing '402', 'billing' or 'rate limit'"
type: bug
status: ready
priority: p0
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T07:35:51Z"
updated_at: "2026-10-06T07:36:04Z"
---
## Problem

P0, found 2026-10-06 while landing #0678. `AgentRunner.checkOutputHealth` (src/server/agents.ts) runs `scrapeProviderFailure(raw)` (src/core/agent-run-health.ts) on EVERY streamed output line of every agent turn and, on a match, calls `abortForProviderFailure` -> `killTurnProcess`. `scrapeProviderFailure` first runs `isProviderFailureReason(trimmed)` on the WHOLE raw line, and that predicate (src/core/attention.ts) matches bare substrings: "402", "billing", "rate limit", "model unavailable", "quota exceeded", "payment required", "insufficient credit", "out of credit". Stream-json lines from Cursor/pi/opencode contain millisecond timestamps, call ids and arbitrary tool output (file contents, test output). Any line containing the digits "402" anywhere, or code/docs mentioning billing or rate limits (an invoicing project like tuk-private is full of them), kills the healthy agent mid-turn. The task then shows needs_input "provider-failure" whose detail is just that random JSON line, and the owner sees a bogus "provider / credit issue" while the agents work fine standalone. Observed: Cursor engineers for #0705 and #0679 died ~10 times in 90 minutes with empty stderr; tuk-private reports the same on cursor, pi and opencode. Landed in #0678 (merged 2026-10-06 13:07 local).

## Desired UX

- Only genuine provider errors abort a turn: structured error events (`type: "error"`, `is_error: true`, an `error` / `error.message` field, or a CLI result with an error status) and short plain-text error lines that START like an error, matched with word boundaries (`\b402\b` in an HTTP / status context, not arbitrary digits).
- Never scan tool output, file contents or whole stream-json event lines for these substrings.
- A real provider error still aborts with the real message as the detail.
- Add a visible way to see why a turn was aborted (the matched field), and a Settings switch to turn the provider-failure abort off (advanced).

## Acceptance criteria

- Tests: a stream-json tool_call/edit line whose text contains "402" in a timestamp, and the words billing / rate limit / model unavailable in file content, returns null; a structured error event with 402 / insufficient credits / rate limit is detected with its message; a plain short "OpenRouter HTTP 402 insufficient credits" line is still detected; a long plain-text line is not. `repoos check` passes.

## Notes for AI

Smallest fix: in scrapeProviderFailure only inspect structured fields for lines starting with "{" and apply isProviderFailureReason (tightened with word boundaries) only to those fields and to short non-JSON lines (<= 300 chars) starting with "error"/"✗"/"fatal". Do not change the degenerate-output tracker here. Read src/ui-app/tests/agent-run-health.test.ts first.

## Activity

- 2026-10-06T07:35:51Z · created · unknown
- 2026-10-06T07:36:03Z · status inbox→ready
- 2026-10-06T07:36:04Z · cli_override, model_override

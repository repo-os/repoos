---
id: "0709"
title: "P0: scrapeProviderFailure kills healthy agents on any output line containing '402', 'billing' or 'rate limit'"
type: bug
status: review
priority: p0
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/p0-scrapeproviderfailure-kills-healthy-a
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T07:35:51Z"
updated_at: "2026-10-06T09:21:10Z"
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
- 2026-10-06T07:36:04Z · status ready→active, branch
- 2026-10-06T07:37:21Z · status active→review
- 2026-10-06T07:37:21Z · status review→active
- 2026-10-06T07:54:22Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-06T08:39:26Z · status active→review
- 2026-10-06T08:39:26Z · status review→active
- 2026-10-06T08:51:22Z · status active→review
- 2026-10-06T08:51:22Z · status review→active
- 2026-10-06T09:15:11Z · note: Field report from tuk-private confirms this bug (15 runs killed). Tightened further on the branch: bare 402 no longer matches anywhere (line numbers '402:', hashes, timestamps); needs HTTP-ish context. Tests added for each vector from the report.
- 2026-10-06T09:15:14Z · status active→review
- 2026-10-06T09:15:15Z · status review→active
- 2026-10-06T09:21:10Z · status active→review
- 2026-10-06T09:21:10Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture


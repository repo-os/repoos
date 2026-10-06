---
id: "0718"
title: "Degenerate-output detector scans tool payloads and tool output, so it kills healthy agents (same class as #0709)"
type: bug
status: review
needs_input: true
needs_input_reason: degenerate-output
needs_input_detail: Degenerate output loop detected after one automatic retry.
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/degenerate-output-detector-scans-tool-pa
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T11:48:55Z"
updated_at: "2026-10-06T14:26:42Z"
dev_error_count: 2
---
## Problem

DegenerateOutputTracker (src/core/agent-run-health.ts, from #0678) is fed every raw stream line in src/server/agents.ts, including tool-call payloads (an editToolCall's streamContent is a whole file) and tool results. It flags 'degenerate' on any of: 200 identical characters in a row (a banner like ====, long indentation or padding, minified content), 12 identical consecutive trimmed lines (repeated '}' or '---' lines), or 256 KB of output with no tool call. Healthy runs hit these on legitimate content. On 2026-10-06 #0679 (several times) and #0717 were stopped with 'Degenerate output loop detected after one automatic retry' while writing/reading ordinary files; the resumed session then fails again. Same defect class as #0709 (substring scan over tool payloads).

## Desired UX

- Only the agent's own assistant/thinking text deltas count toward repetition and no-tool thresholds. Tool-call arguments (edit/write streamContent, shell commands) and tool results are never scanned.
- Thresholds are per text block, not across unrelated lines, and the 'no tool call' byte count resets on any event of type tool_call.
- When it does fire, needs_input_detail shows which rule fired and a short excerpt of the offending text, so a human can tell a real loop from a false positive.
- The automatic retry starts a fresh session (not a resume of the poisoned one).

## Acceptance criteria

- Tests: an editToolCall whose streamContent has 300 '=' characters, a tool result with 20 identical '}' lines, and a 300 KB file read must NOT trigger; a real loop of the same assistant sentence 20 times and a run of 500 identical characters in assistant text MUST trigger.
- Docs updated where #0678 is described. repoos check passes.

## Notes for AI

Read #0709 and its fix (scrapeProviderFailure) first: same approach, structured events only. Related: #0716.

## Activity

- 2026-10-06T11:48:55Z · created · unknown
- 2026-10-06T14:01:52Z · note: Owner feedback: 'degenerate agent output' gives no next step. When it fires, the card/needs_input detail should say (1) which rule fired + a short excerpt, (2) whether it looks like a real model loop (e.g. repeated tokens) or a false positive from tool content, and (3) the recommended action: for a real loop use 'Restart fresh' (new session, optionally a different model); never resume the same session (resume re-poisons it, seen on #0717 and #0679). The card's Restart button should default to a fresh session after a degenerate-output stop.
- 2026-10-06T14:04:02Z · cli_override, model_override
- 2026-10-06T14:04:04Z · status inbox→ready
- 2026-10-06T14:04:06Z · status ready→active, branch
- 2026-10-06T14:14:21Z · agent exited with an error (cursor) · Degenerate output loop detected after one automatic retry.
- 2026-10-06T14:14:34Z · needs_input
- 2026-10-06T14:15:25Z · agent exited with an error (cursor) · Degenerate output loop detected after one automatic retry.
- 2026-10-06T14:25:36Z · status active→review
- 2026-10-06T14:25:36Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-06T14:26:42Z · note: review pass 1: good to go

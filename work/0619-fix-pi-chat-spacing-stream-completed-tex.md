---
id: "0619"
title: "Fix pi chat spacing: stream completed text blocks, not per-token deltas"
type: bug
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/fix-pi-chat-spacing-stream-completed-tex
cli_override: pi
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-01T18:46:44Z"
updated_at: "2026-10-01T23:30:36Z"
review_passes: 3
review_rounds: 2
---
## Symptom

Chat messages from the pi harness render with a blank line between nearly
every word:

```
Existing `

[

board.columns

]` overrides are

untouched — `
```

and the handoff signal shows up raw and fragmented:

```
::

repoos

-handoff-ready::
```

## Root cause

Two bugs in the pi driver's streaming path (introduced with #0616, now on
`main`):

1. `src/server/agents.ts` `parsePiEvent` surfaces every `message_update`
   `text_delta` as its own `{type:"text"}` transcript entry. The chat UI's
   `mergeAssistantText` (`src/ui-app/src/lib/chat-rows.ts`) joins consecutive
   assistant text parts with a blank line — it expects opencode's
   paragraph-sized `text` parts — so each token fragment becomes its own
   paragraph.
2. Those streamed delta entries bypass `applySignals` (only the authoritative
   `message_end` runs it, and its text is then suppressed as a duplicate), so
   `::repoos-handoff-ready::` is never replaced by the `✓ agent requested
   server-side handoff` line and appears raw in the transcript. The handoff
   still fires (message_end is inspected), but the transcript is wrong.

## Fix

Stream at *completed text block* granularity instead of per token:

- In `parsePiEvent`'s `message_update` case, return an entry only for
  `assistantMessageEvent.type === "text_end"` (its `content` is the whole
  block); keep swallowing `text_delta`/`thinking_*`. pi emits `text_end` with
  full `content` on the wire (verified in its provider adapters).
- `appendPiLine`: a `text_end` entry is recorded through `applySignals` and
  sets `piStreamedText`; at `message_end`, record the authoritative text only
  when no block streamed (backfill), then clear the flag. Keep running
  `applySignals` on the full `message_end` text so a signal split across blocks
  still requests handoff.
- This matches how opencode's `text` parts stream, so the UI's existing merge
  behaviour is correct and no UI change is needed.

## Acceptance criteria

- A multi-word pi reply renders as normal prose (one entry per text block; no
  blank line between fragments).
- `::repoos-handoff-ready::` never appears raw in the transcript; it renders as
  the system confirmation line, and the handoff request still fires.
- `repoos check --changed main` passes; update `pi-driver.test.ts` and the pi
  branch of `agent-drivers.test.ts` (the fake pi should emit a `text_end` block
  plus `message_end` and assert one deduped text entry).
- Optionally refresh the adapter-contract fixture/`parsePiRun` to exercise
  `text_end` (the probe already passes via `message_end`).

## Notes

- Discovered from a real usage report on 2026-10-01 after #0616 landed.
- The live `repoos certify pi` probe remains pending valid provider credentials.

## Activity

- 2026-10-01T18:46:44Z · created · unknown
- 2026-10-01T18:47:36Z · cli_override
- 2026-10-01T18:47:38Z · model_override
- 2026-10-01T18:47:44Z · review_cli_override, review_model_override
- 2026-10-01T18:47:46Z · status inbox→ready
- 2026-10-01T18:47:47Z · status ready→active, branch
- 2026-10-01T18:57:58Z · status active→review
- 2026-10-01T18:57:58Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-01T18:58:57Z · status review→active
- 2026-10-01T19:13:25Z · status active→review
- 2026-10-01T19:13:25Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-01T19:14:35Z · status review→active
- 2026-10-01T19:18:58Z · status active→review
- 2026-10-01T19:18:58Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-01T19:21:04Z · needs_input
- 2026-10-01T19:22:42Z · note: Task body is underspecified: missing sections: Problem, Desired UX, Notes for AI
- 2026-10-01T23:24:25Z · status review→active
- 2026-10-01T23:24:32Z · needs_input (review-rounds-exhausted) dismissed by hello@repoos.org
- 2026-10-01T23:29:10Z · status active→review
- 2026-10-01T23:29:11Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-01T23:30:36Z · needs_input

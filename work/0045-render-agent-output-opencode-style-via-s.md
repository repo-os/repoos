---
id: "0045"
title: Render agent output opencode-style via structured JSON events
type: feature
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/render-agent-output-opencode-style-via-s
created_at: "2026-08-06T14:42:05Z"
updated_at: "2026-08-11T00:00:00Z"
---
## Activity

- 2026-08-06T14:42:05Z · created · unknown


## Problem

The agent tab renders the raw `opencode run` TUI transcript as flat text:
ANSI escape codes (`[0m`, `[90m`) show literally, shell commands, tool calls
(`→ Read`, `✱ Grep`), permission warnings, and results are all indistinguishable
plain lines. Hard to follow, and impossible to scan "what did the agent do".
`opencode run` supports `--format json` which emits structured JSON-lines events
(`step_start`, `text`, `tool`, `file-update`, `step_finish`, …) — the same stream
opencode's own UI renders from. We emit the default formatted mode and then try
to read the screen-scraped text.

## Desired UX

The agent tab reads like opencode's own UI:
- Assistant text messages as readable text blocks.
- Tool calls (bash/read/edit/grep/…) as structured, collapsible cards: tool name,
  input (e.g. the command or file path), and output (with ANSI rendered or stripped).
- Step/progress markers and file changes surfaced, not lost in the noise.
- Falls back gracefully to plain text for the claude fallback engine and for
  sessions recorded before this change (no re-parse of history needed).

## Acceptance criteria

- [ ] `AgentRunner` spawns opencode with `--format json` for both initial run and resume (`resumeCommand`), for the default `opencode` engine. claude (`-p`) is unchanged.
- [ ] Runner parses stdout JSON-lines into structured output entries; malformed/non-JSON lines fall back to the existing plain-line handling.
- [ ] Session-id extraction uses the `sessionID` field on every event (reliable) instead of regex-scraping text.
- [ ] The SSE `agent.output` event and transcript retain structured entries (add a shape such as `{ type: 'text'|'tool'|'step'|'sys', ... }`; the store keeps existing `{s,d}` lines working for old sessions and claude).
- [ ] The UI renders structured entries as described in Desired UX; collapsible tool cards, no raw `[0m`-style codes anywhere; plain text entries render as today but with ANSI stripped.
- [ ] Pause/stop, output cap (256 KB), and line-buffering still behave (a partial JSON line at EOF must not be lost or crash the cap logic).
- [ ] `repoos check` passes (build, tests, ui-smoke); a real opencode session displays the new UI in a browser probe.

## Notes for AI

- Touch: `src/server/agents.ts` (spawn args + `onData` parsing), `src/server/server.ts` (SSE shape), `src/ui-app/src/components/TaskDrawer.vue` + its store/types (renderer). Do NOT add runtime dependencies — write a tiny ANSI-strip/parse helper inline.
- The `SESSION_ID_PATTERNS` regexes become unnecessary for opencode but keep them for claude.
- `--dir <workdir>` must remain in the opencode args — do not drop the fix from #0044.
- Verify with a real agent turn (Start work), not just unit tests.

## Activity

- 2026-08-06T18:22:29Z · status inbox→ready

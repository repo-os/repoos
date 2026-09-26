---
id: "0506"
title: Group consecutive tool calls into one expandable chat row
type: feature
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: opencode
model_override: opencode-go/space-bunny-free
created_at: "2026-09-26T01:56:07Z"
updated_at: "2026-09-26T02:02:16Z"
---
## Problem

The AI chat transcripts are dominated by tool-call noise. A single agent turn
produces far more tool rows than actual messages, so scrolling a task drawer,
the reviewer pane, or the debugger chat is mostly reading individual `bash`
/ `read` / `edit` invocations one at a time. The real conversation — what the
agent said and decided — gets buried.

Three specific complaints:

1. **No grouping.** Ten tool calls in a row render as ten separate rows, each
   with its own chrome. There is no at-a-glance sense of "the agent did a
   batch of work here".
2. **No outcome signal.** Nothing on a row tells the user whether the batch
   succeeded. You have to inspect every call to learn that one of them errored
   and the agent had to retry.
3. **Extraneous rows.** The step-marker rows are noise. A `{ type: "step",
   kind: "finish" }` entry renders as a bare "continue" chip with its own
   "tool calls" timestamp (the `reason` is the string `"tool calls"` for
   opencode). It carries no content the user cares about, and the timestamp it
   displays is confusing — the user reasonably reads it as "these tool calls
   happened at 14:32", which is both redundant and wrong. The corresponding
   `kind: "start"` markers are already dropped in the UI; the `finish` ones
   should go too rather than linger as decoration.

Timestamps on real rows are also inconsistent: a row's time is whatever was
stamped on the entry that created it, so a batch of work reads as if it all
happened at the first call.

## Desired UX

**One row per run of consecutive tool calls.** A maximal run of adjacent
`tool` entries collapses into a single row:

```
[ ⚒  6 tool calls        4 ok · 2 failed ]                    14:32:07
```

- Click (or keyboard-activate) the row to expand it and see every individual
  tool call with its own input and result, nested under the row. The expanded
  list is read-only rendering of the same entries — it must not change what is
  stored, streamed, or exported.
- The row carries a **total count** badge so the user knows how much is hidden
  before expanding.
- The counts are **split by outcome**: successes in green, errors in red. If
  all succeeded, show only the green success count (e.g. `6 ok`); only render
  the failure segment when there is at least one error.
- The row's timestamp is the **latest** `at` among the tool calls it groups
  (4 calls at 14:32:01–14:32:07 → the row reads 14:32:07), so it reflects when
  the work actually finished.
- A non-adjacent tool call (one separated by a text or human message) starts a
  new row. Two tool-call runs are never merged across a real message.

**Timestamps everywhere.** Every rendered row — text, human, tool-call group,
system line — shows a last-updated timestamp sourced from the newest entry it
contains.

**No contentless rows.** The "continue" / step-finish marker rows are removed
from the rendered transcript. Where a step boundary was the only thing marking
the end of a batch of tool calls, that information is already carried by the
grouped tool-call row and its timestamp, so nothing is lost. Step entries may
remain in the stored/streamed data (other consumers read them), they just do
not render as their own chat row.

**Consistent across every chat.** Task drawer (engineer + reviewer), Repo
Guide chat, both debugger chats, and the CTO panel all get the same grouping,
counts, colours and timestamp treatment.

**Consistent across every agent.** opencode, claude code, codex, github
copilot, cursor, kiro, qwen, antigravity — grouping is a rendering concern
applied to the normalized entry stream, so it behaves identically whichever
driver produced the entries.

## Acceptance criteria

- [ ] A maximal run of adjacent `tool` entries renders as **one** tool-call
      row; a text or human entry between two tool runs splits them into two
      rows.
- [ ] The tool-call row shows a **total count** of the tool calls it contains.
- [ ] The row shows **separate success and error counts**, success styled green
      and error styled red (existing theme success/danger tokens, not hardcoded
      hex). A run with no errors shows the success count only; a run with errors
      shows both.
- [ ] Clicking the tool-call row expands/collapses it and shows each individual
      tool call **with its input and result**, in original order. Expansion is
      per-row and defaults to collapsed.
- [ ] The tool-call row's timestamp is the **maximum** `at` across the tool
      calls it groups, not the first one.
- [ ] Every rendered row (text, human, tool-call group, system) displays a
      timestamp taken from the newest entry it represents.
- [ ] No "continue" / step-finish marker row is rendered. Step entries are
      dropped from the display pipeline (alongside the existing `kind: "start"`
      drop) rather than being converted into an empty row.
- [ ] The grouping/count/timestamp logic is implemented **once** in a shared
      place and reused by every chat, not copy-pasted per component.
- [ ] The tool-call row is a **shared component**, and all chats that render
      tool calls use it, instead of each chat hand-rolling its own row markup
      (today several chats degrade tool entries to plain text like
      `Checked with <tool> · <state>`; those must render the real grouped row).
- [ ] Behaviour is identical across all supported agents: opencode, claude
      code, codex, github copilot, cursor, kiro, qwen, antigravity. Verified
      for every engine listed in the agent-kind union, not just opencode.
- [ ] Streaming behaves sanely: a tool-call row grows as calls arrive during a
      live run, updating its count and timestamp, and does not flicker or reset
      the scroll position (respect the `useChatScroll` contract).
- [ ] Grouping is a **view-layer** transform. The stored transcript, the SSE
      `agent.output` events, and any export/debugger endpoint still see the
      original individual entries in order.
- [ ] New tests cover: run-splitting, counts, timestamp-max, and the removal of
      step-marker rows; plus at least one test proving two different agents'
      entries produce identical rendered grouping.
- [ ] `repoos check` passes (format, lint, build, tests, UI smoke). Run
      `bun run fmt` before committing on the branch.

## Notes for AI

Two screenshots are attached to this task (the current chat view) — use them
to match the existing visual language rather than inventing a new look.

**Where the pieces live (as of this task):**

- Entry model: `AgentOutputEntry` in `src/core/types.ts` (`type: "tool"` with
  `state: "completed" | "error"`, `type: "step"`, plus the `at` timestamp on
  every variant) and its deliberate client mirror in
  `src/ui-app/src/types.ts`. The union itself likely does not need a new
  variant — a group is a view concern.
- Row rendering today:
  - `src/ui-app/src/components/TaskDrawer.vue` — `DisplayEntry` +
    `displayEntries` (engineer/PM log) and `reviewEntries` (reviewer log);
    step `start` is dropped there today and `finish` renders the "continue"
    chip (`entry.stepReason === "stop" ? "done" : "continue"`). This is the
    main surface.
  - `src/ui-app/src/components/RepoGuideChat.vue`, `DebuggerChat.vue`,
    `TaskDebuggerChat.vue`, `CTOPanel.vue` — these currently flatten tool
    entries to a single line of text and must be migrated to the shared row.
- Row styles live in `src/ui-app/src/style.css` under `.agent-tool*` /
  `.agent-step*` — add group styles there, not in a component `<style scoped>`
  block.
- Tests for chat UX live in `src/ui-app/tests/` (not next to the source).
  `ai-chat-standard.test.ts` enforces the `useChatScroll` contract in chats —
  respect it.

**Reuse is an explicit requirement.** Create one shared grouping function
(turn a flat `AgentOutputEntry[]` into display rows, dropping step markers) and
one shared tool-call-row component. Do not fix this five times.

**Suggested shape:** a new shared module exporting
`toDisplayRows(entries: AgentOutputEntry[]): DisplayRow[]` where
`DisplayRow` is a discriminated union like
`{ kind: "text" | "human" | "sys", entry, at } | { kind: "tools", at, ok,
failed, calls }`. The single-group tool-call row is then just the degenerate
`calls.length === 1` case, so small runs and big runs render by the same code
path. Expand/collapse state is local to the row component, keyed by row
identity — not global, so it survives re-renders and new streaming entries
without collapsing under the user.

**Not in scope:** changing what drivers emit, adding new `AgentOutputEntry`
variants, or persisting the grouping. Do not modify the per-agent parsers
(`parseJsonEvent`, `parseClaudeEvent`, `parseCopilotEvent`, `parseCodexEvent`,
`parseCursorEvent`, `parseAntigravityEvent`, …) — grouping after normalization
is the whole point.

**Assumptions made** (flag them if any are wrong):
- "Green / red" means the existing theme success/danger colours, so it works
  in both light and dark themes.
- Error detection keys off the existing `state: "error"` on tool entries; a
  tool call whose output merely *contains* an error string is not counted as a
  failure.
- Expansion is collapsible again (not one-way), and there is no "expand all"
  control — the user asked for a per-row affordance.
- Step entries stay in the data model and in the SSE stream; only their
  rendering is removed, because other consumers (report extraction, skill
  suggestions, debugger endpoints) read them.

## Scope

Covers: grouping, counts with success/error split, per-row expansion, row
timestamps, removal of the contentless "continue" rows, shared
logic/component reuse, and coverage across all supported agents and all chat
surfaces.

Deferred: any *redesign* of the host panels' layout beyond swapping in the
shared row — migrating the flattening chats to the real grouped row is in
scope, the rest of their layout is not. Also out of scope: search/filter over
transcript contents, transcript export formats, and persisting expand/collapse
state across reloads.

## Related

- `docs/architecture.md` — per-agent driver/parser description; update if the
  rendering pipeline description there changes.
- #0466 agent adapter contract — the per-agent capability probe; if grouping
  needs any agent capability signal, wire it through that contract rather than
  sniffing CLI names.

## Original prompt

Currently there are many more tool calls than actual messages in the AI chat logs, let's combine multiple tool calls in a row into a single entry in the chat, which can be expanded by the user to see each individual tool call and result. Put a count on the tool call row so the user can easily see how many tool calls are in that row. Also let's split out the counts for success and error tool calls (green for success and red for error). Make sure to do this in all AI chats and try to re-use logic/components where necessary. Also make sure each chat row has a last updated timestamp (e.g. if 4 tool calls happen in a row then the timestamp on that row is the latest). Also I'm not really sure what "continue" means and why it has it's own row in the chat with a timestamp for "tool calls". let's just make the actual tool call rows be timestamped, and remove any extraneous rows that don't show useful content (or compress into the single tool call row with the other tool calls. Also make this this works for all coding agents available in this system: opencode, claude code, codex, github copilot, cursor, kiro etc

## Screenshots

![Screenshot-2026-09-26-at-08.47.24](/api/tasks/0506/attachments/screenshot-1.png)
![Screenshot-2026-09-26-at-08.40.54](/api/tasks/0506/attachments/screenshot-2.png)

## Activity

- 2026-09-26T01:56:07Z · created · hello@repoos.org
- 2026-09-26T01:56:08Z · screenshots
- 2026-09-26T01:56:08Z · screenshots
- 2026-09-26T01:59:03Z · status draft→inbox, title, priority, area, body
- 2026-09-26T02:02:15Z · cli_override, model_override
- 2026-09-26T02:02:16Z · model_override

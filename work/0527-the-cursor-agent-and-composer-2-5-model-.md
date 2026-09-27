---
id: "0527"
title: "Clamp runaway whitespace in rendered agent output (empty bubbles, blank-line runs, code-block tails)"
type: bug
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/clamp-runaway-whitespace-in-rendered-age
created_at: "2026-09-27T02:28:27Z"
updated_at: "2026-09-27T04:37:38Z"
---
## Problem

Agent messages render with a band of blank space underneath them, most visibly
with the **cursor** driver on **composer 2.5**. The whitespace is not one bug but
four separate leaks between the transcript and the DOM, and they produce two
different symptoms — space *below* a message, and space *inside* one.

I traced the path end to end and confirmed each of these by running the real
renderer (`src/ui-app/src/lib/markdown.ts` and `src/ui-app/src/lib/chat-rows.ts`)
against the shapes these agents emit. What is already handled: blank lines
*between prose blocks* are fine — `parseBlocks` skips them and
`renderSoftLines` joins a paragraph's lines as soft breaks, so
`"one\n\n\n\n\ntwo"` already renders as two paragraphs. The four leaks below are
the ones that get through.

**1. A whitespace-only text entry becomes a whole empty bubble.** This is the
"bunch of white space below each chat message" case, and it is the main one.
`toDisplayRows` drops a text entry only when the text is the empty string:

```ts
if ("type" in entry && entry.type === "text" && !text) continue;
```

`"\n\n"` is truthy, so a whitespace-only part survives. When such a part is
*isolated* — it landed next to a tool-call run, or it is the last thing on the
stream — `toDisplayRows` cannot merge it into a neighbour and emits a row whose
only content is the whitespace. `renderMarkdown("  \n  \n  ")` returns `""`, so
the row renders an **empty assistant bubble**: `.pm-bubble-assistant` is
`background: var(--panel)` + `1px` border + `9px 11px` padding, and the row is
held to ~24px by the `pm-mini-avatar`. The result is a visible empty rounded box
under the message. Consecutive whitespace parts do get absorbed (they merge into
the neighbouring text row), which is exactly why this looks intermittent —
whether you see the gap depends on whether a tool call happened to sit next to
the whitespace.

Confirmed:

| entries | rows drawn |
| --- | --- |
| `text("All done.")`, `tool`, `text("\n\n\n")` | `text`, `tools`, **empty assistant bubble** |
| `text("Working…")`, `tool`, `text("\n\n")`, `tool`, `text("Finished.")` | `text`, `tools`, **empty assistant bubble**, `tools`, `text` |
| `text("Working…")`, `tool`, `text("\n\n")`, `text("Finished.")` | `text`, `tools`, `text` — fine, absorbed |

**2. `sys` and legacy `line` entries have the same hole.** `rowText` returns
`stripAnsi(entry.d)` for those, and the drop guard above only applies to
`type: "text"`, so a whitespace-only `{ type: "sys", d: "\n\n" }` also becomes an
empty status bubble. It is rarer because `parseClaudeEvent` already
`!text.trim()`-filters assistant text, but the guard belongs in one place.

**3. Fenced code blocks keep their trailing blank lines verbatim — this is the
"within a single message" case.** `renderBlock` does
`escapeHtml(b.lines.join("\n"))` with no trimming, and `<pre>` is
`white-space: pre` by default, so every trailing newline is a real blank line:

```
"```sh\nnpm test\n\n\n\n```\n"  →  <pre><code>npm test\n\n\n\n</code></pre>
```

Three blank lines under the code block, inside the message.

**4. An unterminated fence is the worst variant of the same thing.** `parseBlocks`
runs to end-of-input when no closing marker arrives, so the code block keeps its
trailing newlines *and* swallows the remainder of the message. This is common
while a message is still streaming (the fence is open by definition mid-message)
and happens permanently when the model simply omits the closer:

```
"Here is the diff:\n\n```ts\nconst a = 1;\n\n\n"
  →  <p>Here is the diff:</p><pre><code class="language-ts">const a = 1;\n\n\n\n</code></pre>
```

**5. Invisible-only lines become real paragraphs.** JS `\s` does not match
`\u200b` (zero-width space), `\ufeff` or `\u00ad`, so a line holding only those is
not "blank" to `parseBlocks` and becomes its own `<p>` with a `0 0 7px` margin —
a phantom blank line mid-message:

```
"Done.\n\u200b\n\u200b\nBye."  →  <p>Done.   Bye.</p>   // three rendered lines
```

Also worth folding in while you are there: `toDisplayRows` joins merged text
parts with a hardcoded `"\n\n"`, so a part that already ends in newlines pushes
the effective gap further. Harmless today only because the markdown parser
happens to absorb it — the clamp should own that separator so the two layers
cannot drift.

## Desired behaviour

Clamp whitespace **at the display boundary**, with one rule per leak above:

- **A row that would render empty is not drawn at all.** If an entry's text is
  whitespace-only — including strings made only of zero-width/BOM characters —
  drop the row rather than emit an empty bubble. Applies to `text`, `human`,
  `sys` and legacy `line`/`out`/`err` entries alike.
- **Inside one message, never more than one blank line** (the "1 line" limit from
  the original report): a run of 3+ blank lines collapses to at most one. One
  blank line is a deliberate paragraph break and stays.
- **At the end of a message, no trailing blank lines at all.** A message never
  ends in visible whitespace, whether the run is in prose or inside a fenced
  block.
- **A fenced code block's own interior blank lines are untouched** — leading
  indentation, deliberate spacing inside a snippet, and the blank line a `sh`
  block uses to separate commands must all survive verbatim. Only the *trailing*
  run at the end of the block is clamped.
- **An unterminated fence still renders as a code block.** Do not "fix" the
  mid-stream case by dropping the block or by inventing a closing fence in the
  stored data; clamp the trailing whitespace and let the closer arrive on the
  next stream event.

## Implementation notes

Both fixes belong in the shared view layer, not in any one component — the four
chat surfaces that draw agent rows (`PmChatSurface.vue`, `RepoGuideChat.vue`,
`TaskDebuggerChat.vue`, `DebuggerChat.vue`, plus `ModelPlaygroundPanel.vue` and
`CTOPanel.vue` for non-transcript markdown) all call the same two functions, so
a fix there covers every surface at once and cannot drift per-chat:

- `src/ui-app/src/lib/chat-rows.ts` — the empty-row drop (leaks 1 and 2) and the
  merge separator. `toDisplayRows` is the single place that decides what a row
  is; the drop belongs next to the existing `!text` guard, and the whitespace
  test should be `trim`-based over an invisible-character set rather than a
  bare `!text`.
- `src/ui-app/src/lib/markdown.ts` — the blank-run clamp and the code-block
  trailing trim (leaks 3, 4 and 5). Clamp in `parseBlocks` (so it applies to
  every block kind) or as a small exported helper that `parseBlocks` calls, and
  keep the fence's `body` trim separate from the prose clamp.

**This must stay a view-layer transform, exactly as #0506 established.** Do not
trim what is stored in the transcript, what is streamed over SSE as
`agent.output`, or what the debugger endpoints and report extraction read — the
raw entries stay byte-for-byte as the agent produced them. Clamp on the way to
the DOM, in the same spirit as the tool-call grouping that already lives in
`chat-rows.ts` and is documented in that module's docblock. If you add a new
shared-behaviour rule, `docs/ai-chat-standards.md` (which has a numbered
contract and a machine-checked registry in `src/ui-app/src/lib/ai-chat.ts`) is
the place to record it, and `ai-chat-standard.test.ts` is what enforces it.

Do **not** add a runtime dependency for this — the repo is zero-runtime-deps and
the renderer is deliberately hand-rolled for that reason.

## Acceptance criteria

1. No empty bubble is ever drawn. For a transcript of
   `[text("All done."), tool, text("\n\n\n")]`, the chat draws two rows (the
   message and the tool run), and no element with an empty `.pm-bubble-*` /
   `.guide-bubble-*` / `.td-bubble-*` / `.debugger-bubble-*` body appears.
2. The same holds for a whitespace-only `sys` entry and for a legacy
   `{ s: "out", d: "\n" }` entry.
3. `"step one\n\n\n\n\n\nstep two"` renders as two paragraphs with a single
   blank line between them — never three or more.
4. A message ending in trailing newlines renders no trailing vertical space, in
   both the markdown path and the plain-`<span>` (human / status) path.
5. `"```sh\nnpm test\n\n\n\n```"` renders the code block with **no** trailing
   blank lines inside the `<pre>`, while `"```sh\nnpm test\n\ncd dist\n\nnpm run build\n```"`
   keeps both interior blank lines verbatim.
6. An unterminated fence still renders a `<pre>` containing the streamed code,
   with no trailing blank lines.
7. `"Done.\n\u200b\n\u200b\nBye."` renders two visible lines, not three.
8. Streaming still looks right: a message that is mid-sentence, mid-list or
   mid-fence renders progressively with no layout jump, and no blank gap appears
   then disappears as parts arrive.
9. **Nothing below the view layer changes.** The entries in the persisted
   transcript, the `agent.output` SSE payloads and the debugger output are
   unchanged — same text, same order, same count.
10. No regression in the shared markdown renderer: existing
    `src/ui-app/tests/markdown.test.ts` cases (soft-wrapped prose, explicit hard
    breaks, tables, task checkboxes, Mermaid, intraword underscores, the
    code-span literal cases) still pass untouched, and the AI-chat standard
    conformance test still passes.

## Tests

- `src/ui-app/tests/markdown.test.ts` — the blank-run clamp (3+ → 1), the
  code-block trailing trim, interior blank lines preserved, the unterminated
  fence, and the zero-width-line case.
- `src/ui-app/tests/chat-tool-rows.test.ts` (or a sibling
  `chat-rows` suite if that is where row grouping is asserted) — the
  empty-row drop for `text` / `sys` / `line`, including the isolated-between-
  tool-runs and end-of-stream shapes from the table above, and the invariant
  that the drop happens at row-build time and leaves the input array untouched.
- `bun run test` (not bare `bun test` — see `AGENTS.md`), then a green
  `repoos check`, which includes the WebKit UI smoke test that fails on any
  console error.

## Scope

Covers: whitespace clamping for rendered agent output — the empty-row drop, the
in-message blank-line clamp, the code-block trailing trim, and invisible-only
lines.

Deferred / out of scope:

- **Trimming the stored data.** Explicitly not doing this; see Implementation
  notes. If a future task wants transcripts normalized at write time, that is a
  separate decision with its own migration and export implications.
- Server-side driver parsing (`src/server/agents.ts`). The blank-text filters
  there are correct and stay; this is a display concern.
- Any change to *what* the agents are told or how they are driven — this is a
  rendering fix, not a prompt fix. Do not try to stop composer 2.5 emitting
  trailing newlines.
- Styling the bubbles, the log rhythm, `ai-chat-log` gaps, the jump-to-latest
  control, or anything else in the chat standard's items 1–7.
- The model playground's and CTO panel's non-transcript markdown *sources*
  (release notes, board reports, story and doc bodies). They share the renderer
  and inherit the clamp for free — that is desirable, not a separate task.

## Related

- `src/ui-app/src/lib/chat-rows.ts` — `toDisplayRows`, `rowText`, `bubbleRole`;
  the module docblock states the view-layer-only invariant this task extends
- `src/ui-app/src/lib/markdown.ts` — `parseBlocks`, `renderBlock`,
  `renderSoftLines`, `renderMarkdown`
- `src/ui-app/src/components/PmChatSurface.vue`,
  `src/ui-app/src/components/RepoGuideChat.vue`,
  `src/ui-app/src/components/TaskDebuggerChat.vue`,
  `src/ui-app/src/components/DebuggerChat.vue` — the four row-drawing surfaces
- `src/ui-app/src/style.css` — `.pm-bubble*` / `.pm-row*` and the
  `.md-rendered` block margins; the clamp is a data fix, so this file should
  need no change
- `src/ui-app/tests/markdown.test.ts`, `src/ui-app/tests/chat-tool-rows.test.ts`,
  `src/ui-app/tests/ai-chat-standard.test.ts`
- `docs/ai-chat-standards.md` — the numbered chat contract; item 6 is the
  #0506 tool-row precedent for "a display-boundary transform, never a data
  change"
- `src/server/agents.ts` — `parseClaudeEvent` / `claudeAssistantEntry`, the
  claude-style path the cursor driver uses (read for context; not modified)
- `src/ui-app/tests/cursor-driver.test.ts` — existing cursor-driver coverage

## Original prompt

The cursor agent (and composer 2.5 model) add a bunch of white space below each chat message. can you add some whitespace clamping so this doesn't happen? also I noticed it often at the end of a message, but sometimes it even happens within a single message, so figure out what to do in both cases (maybe limit white space between the same message to 1 line).

## Screenshots

![Screenshot-2026-09-27-at-10.26.47](/api/tasks/0527/attachments/screenshot-1.png)

## Activity

- 2026-09-27T02:28:27Z · created · hello@repoos.org
- 2026-09-27T02:28:28Z · screenshots
- 2026-09-27T02:30:23Z · note: Freeform PM run failed: the PM agent returned unusable output
- 2026-09-27T04:07:32Z · title, area, type, body
- 2026-09-27T04:07:35Z · status draft→inbox
- 2026-09-27T04:32:22Z · status inbox→ready
- 2026-09-27T04:32:24Z · status ready→active, branch
- 2026-09-27T04:37:38Z · status active→review

# The AI chat standard

Every AI chat surface in the RepoOS web UI — Ross, the CTO Board Monitor, the
Debugger, the per-task Debugger, the Model Playground and a task's PM chat —
obeys the same rules. They are not six independent implementations that happen
to look alike; they are six call sites of one shared contract (#0444).

This page is the spec. `src/ui-app/src/lib/ai-chat.ts` is the machine-readable
half (the registry of surfaces), and `src/ui-app/tests/ai-chat-standard.test.ts`
fails the build when a surface drifts or a new one forgets the contract.

## The contract

A chat surface is a few shared pieces plus its own bubbles:

| Piece | Where | Owns |
| --- | --- | --- |
| `useChatScroll()` | `src/ui-app/src/composables/useChatScroll.ts` | scroll-to-newest, position memory, "am I away from the bottom" |
| Jump control | `<ChatJumpToLatest>` or inline `.agent-jump` | the "Jump to latest" / "Latest" button |
| `<AiChatThinking>` | `src/ui-app/src/components/AiChatThinking.vue` | the pulsing working indicator |
| `toDisplayRows()` | `src/ui-app/src/lib/chat-rows.ts` | turning a transcript into rows: tool-call grouping, text merging, dropping step markers |
| `<ChatToolCallRow>` | `src/ui-app/src/components/ChatToolCallRow.vue` | one run of consecutive tool calls, as a counted, expandable row |

Visual rhythm is not per-component either: `.ai-chat-log` (message spacing),
`.ai-chat-thinking` (the pulse) and `.ai-chat-send` (the send button's accent
fill) live in `src/ui-app/src/style.css`. A chat's own `<style scoped>` block
must **not** set a competing `gap` on its log, and must not set `background`
or `color` on its compose buttons — the fill comes from the shared class.

That second rule is a specificity trap, not a style preference. Vue rewrites a
scoped `.x-compose button` into `.x-compose button[data-v-…]`, which is
(0,2,1) and therefore beats the global `.ai-chat-send` at (0,1,0). Setting a
fill in the scoped rule silently wins and leaves the send button transparent —
which is how #0444 first shipped. Per-button variants (`.x-stop`, `.pm-attach`)
are fine: their extra class keeps them out of the base rule's way. The
conformance test asserts this directly.

### 1. Open on the newest message

A chat opens scrolled to the bottom. `useChatScroll` does this in `restore()`
whenever the surface becomes active and no position is remembered for it.

### 2. Remember where the reader was

The distance from the bottom is persisted to `localStorage` under
`repoos.chat-scroll.<chatId>`, per conversation. Coming back to a chat lands
the reader where they left off. Distance-from-bottom is stored rather than
`scrollTop` so it survives content that grew or shrank while they were away.

### 3. Follow new output only when already at the bottom

`useChatScroll` watches `contentSize`. If the reader was at the bottom before
the append, it follows; if they were reading history, it leaves them alone and
just refreshes the measurement. Never yank the viewport out from under someone
who scrolled up on purpose.

### 4. Offer a jump back down

`showJumpToLatest` is true whenever the reader is more than
`CHAT_BOTTOM_THRESHOLD` (64px) from the bottom. It drives either
`<ChatJumpToLatest>` (teleported to `<body>` — a `position: fixed` child of a
drawer is trapped in that drawer's stacking context and ends up unclickable) or
an inline `.agent-jump` sibling inside a `position: relative` log wrap. Floating
head panels (Ross, CTO, Debugger, Playground) use the inline control because
the teleported button's clicks were intercepted by the Radix Dialog stacking
context despite living on `<body>`. Clicking either control scrolls smoothly to
the newest message and the button hides itself on arrival.

### 5. Signal "working" visually, never in text

`<AiChatThinking :active="busy">` renders three pulsing dots while the model is
working and **nothing at all** when it is idle. There is no "agent stopped"
status line anywhere: a stopped agent is the absence of the indicator. The
`— agent stopped —` entry that `stores/repo.ts` used to append to the agent
transcript was removed under this rule.

### 6. Group consecutive tool calls into one row

A turn emits far more tool calls than messages, so one row per call buried the
conversation under `bash` / `read` / `edit` chrome. `toDisplayRows()` in
`src/ui-app/src/lib/chat-rows.ts` is the only place that decides what a row is,
and `<ChatToolCallRow>` is the only thing that draws one:

```
[ ⚒  6 tool calls        4 ok · 2 failed ]                    14:32:07
```

- A **maximal run** of adjacent `tool` entries collapses into one row. A text,
  human, system or plain line between two runs splits them; two runs are never
  merged across a real message.
- The row carries a **total count** so you know what is hidden, split by
  outcome — successes in the theme's success colour, errors in its danger one.
  The failure segment is only rendered when something actually failed.
- The row's timestamp is the **newest** `at` among the calls it groups, so it
  reads as when the work finished. Every other row (text, human, system) takes
  the newest `at` among the entries it represents.
- **Step markers draw no row at all.** A `step` entry is dropped at the display
  boundary rather than rendered as a contentless "continue" chip, and because it
  is dropped it cannot split a run either — the grouped row's own timestamp
  already marks where the batch ended.
- Adjacent assistant text parts merge into one message, so a multi-part reply
  is one block rather than several.
- Expansion is per row, collapsible, and defaults to collapsed. It is native
  `<details>`, which is also why the row is keyboard-activatable and keeps its
  open state while a live run streams more calls into it.

**This is a view transform and nothing else.** The stored transcript, the SSE
`agent.output` events and the export/debugger endpoints still see the original
individual entries in order, and `step` entries stay in the data model — report
extraction, skill suggestions and the debugger read them. Only the drawing
changed.

Grouping happens *after* normalization and branches on nothing agent-specific,
so it behaves identically for every driver. One wrinkle worth knowing: the
drivers do not agree on how a failure is spelled. Most normalize to
`state: "error"`, but Codex passes `item.status` through verbatim and its JSONL
says `"failed"`, so `isFailedState()` matches both — otherwise a failed Codex
command would be counted in the green success total.

### 7. Add the surface to the registry

`AI_CHAT_SURFACES` in `src/ui-app/src/lib/ai-chat.ts` lists every surface, and
the conformance tests in `src/ui-app/tests/ai-chat-standard.test.ts` assert the
contract above against each one. A chat that renders an `AgentOutputEntry`
stream must call `toDisplayRows` and render `<ChatToolCallRow>`; degrading tool
entries to a line of prose is the specific regression the `Checked with` guard
exists to catch. The Model Playground is exempt by construction — it is a raw
model call with its own `{ role, text }` messages and no tool events at all.

## Adding an AI chat

1. `useChatScroll(logRef, { chatId, contentSize, active })`; destructure
   `showJumpToLatest`, `onScroll`, `scrollToLatest` (destructured, not held as
   an object — the template needs the refs unwrapped).
2. Put `ai-chat-log` on the scrolling element and `@scroll="onScroll"` on it.
3. Render a jump control driven by `showJumpToLatest` — either
   `<ChatJumpToLatest :visible="showJumpToLatest" :anchor="logRef"
   @click="scrollToLatest()" />`, or an inline
   `<button v-if="showJumpToLatest" class="agent-jump" @click="scrollToLatest()">`
   sibling inside a `position: relative` log wrap (required for floating-head
   panels inside a Radix Dialog).
4. Render `<AiChatThinking :active="busy" :label="..." />` at the end of the
   message list.
5. Put `ai-chat-send` on the submit button.
6. Run the transcript through `toDisplayRows(lines)` and render each row:
   `row.kind === "tools"` goes to `<ChatToolCallRow :calls="row.calls" :at="row.at" />`,
   everything else to your own bubbles (use `bubbleRole(row)` for the speaker and
   `row.text` / `row.at` for the body and its timestamp).
7. Add the surface to `AI_CHAT_SURFACES` in `src/ui-app/src/lib/ai-chat.ts`.

Then run `bun run test` — the standard test tells you if you missed one.

## Why not just a single `<AiChat>` component?

The six surfaces differ in what they send (repo context, board health, a bug,
a task, a raw model call), how they authorise, and what furniture sits around
the transcript (dispatch buttons, repair actions, model sidebar). What they
have in common is *behaviour*, not markup — so the shared pieces are the
behaviour (scroll, jump, working state, row grouping) and the rhythm, and each
surface keeps its own bubbles.

---
id: "0067"
title: Signal when a task is waiting on the human and make the agent mission a fail-safe checklist
type: feature
status: active
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/0067-waiting-on-human-signal
created_at: "2026-08-11T01:23:19Z"
updated_at: "2026-08-11T01:27:41Z"
---
## Activity

- 2026-08-11T01:23:19Z · created · unknown

## Problem

Two real failure modes, both observed this cycle:

1. **Agents skip critical mission steps.** #0063's agent committed the worktree
   copy of the task file with `status: review`, ran a green `repoos check`, then
   stopped — but never updated the **main-checkout** copy, so the board on 7171
   kept showing `active`. The mission's step 3 is a dense wall of prose
   (`src/server/agents.ts` `missionFor`) and agents partial-complete it; there
   is no verification step that the board actually reflects the real status.
2. **Waiting-on-human is indistinguishable from stuck.** #0063's agent stopped
   on purpose to ask "Want me to commit?" — but the board showed a plain `active`
   task, so the human could not tell whether the task was stuck, dead, or waiting
   for their go-ahead. There is no explicit signal for "the agent needs the
   human", so every ambiguous stop looks identical to a token-exhaustion crash.

## Desired UX

- A task waiting on the human is **unmistakable**: its card pulses with a
  "needs input" badge, and the task drawer's Agent tab shows a clear
  "waiting for you — reply to continue" state instead of implying the agent is
  running or the task is progressing.
- When an agent needs a decision, it signals that explicitly (sets
  `needs_input: true` in BOTH copies of the task file) rather than silently
  leaving the task `active`. When the human replies in the task chat, the flag
  clears and the run resumes.
- The agent mission becomes a **literal, verifiable checklist** with the
  both-copies sync as a numbered step followed by a read-back verification, so
  the #0063 class of bug (board disagrees with the branch) cannot pass silently.

## Acceptance criteria

- [ ] New frontmatter field `needs_input: bool` is modeled in `TaskFrontmatter`
      (`src/core/types.ts`) and surfaced on `Task` (e.g. `needsInput: boolean`,
      default `false`); it round-trips through `patchTaskFile`, the indexer, and
      unknown-key preservation. False is never written when unset.
- [ ] `missionFor` (`src/server/agents.ts`) is rewritten as a numbered
      fail-safe checklist that (a) requires `repoos check` green before
      anything else, (b) commits on the branch, (c) sets `status: review` in
      BOTH copies — worktree copy committed, main-checkout copy edited WITHOUT
      commit — then (d) **reads the main-checkout copy back and confirms it
      shows `review`** before stopping, and (e) when blocked or needing a
      decision, sets `needs_input: true` in BOTH copies (worktree committed,
      main copy not) and stops — explicitly forbidding silently leaving the
      task `active`.
- [ ] A fixture test asserts the mission text contains the both-copies
      verification and the needs-input instruction (pattern: existing
      `agent-drivers.test.ts`), so future mission edits can't silently drop
      them.
- [ ] `POST /api/tasks/:id/message` clears `needs_input` (main copy) before
      resuming the session; `start` and `pause` also clear it.
- [ ] UI: a task with `needsInput` gets a pulsing "needs input" treatment on
      its card (`TaskCard.vue` — reuse/extend the existing `flash`/pulse
      styling) plus a visible badge; the task drawer's Agent tab shows a
      "waiting for you" state (not "running") when `needsInput` is true; the
      change surfaces live via the existing `task.updated` SSE path (the file
      watcher already emits on frontmatter edits).
- [ ] `repoos check` passes; zero new runtime dependencies.

## Notes for AI

- **The mission lives in one string**: `missionFor` in `src/server/agents.ts`
  (lines ~204-233). Keep it self-contained and imperative; the numbered
  checklist is read by every engineer agent on every run. The read-back
  verification step is the specific anti-#0063 fix: after editing the main copy
  to `review`, re-read the file and confirm the `status` line.
- **`needs_input` sync mirrors status sync**: when an agent sets it, both copies
  must change (worktree copy committed on the branch; main copy edited so the
  board sees it — exactly the status rule). The main copy is what drives the
  board; the UI must not require the branch copy.
- **Don't invent a new status**: `needs_input` is a flag layered on `active`,
  not a 7th status — the task stays `active` (the agent may resume), the flag
  just tells the human to look. Keep `STATUSES` untouched.
- **Files to touch**: `src/core/types.ts` (field), `src/core/indexer.ts` +
  `src/core/task.ts` (parse/round-trip), `src/server/agents.ts` (mission),
  `src/server/server.ts` (message/start/pause clearing), `src/ui-app/src/
  components/TaskCard.vue` + `TaskDrawer.vue` + `stores/repo.ts` + `types.ts`
  (badge, waiting state), tests.
- **Self-hosting rule**: after UI changes run `bun run build:ui`, keep
  `repoos serve` running, and probe: a task with `needs_input: true` on the
  board shows the pulsing badge; replying clears it live.
- **Don't**: don't add heuristics (question-mark detection etc.) — the signal is
  explicit; don't change STATUSES; don't autosave or alter the done flow; don't
  make `needs_input` affect status transitions.

## Scope

- **This task**: the `needs_input` flag + clearing semantics, the mission
  checklist rewrite + text fixture, the card pulse/badge and drawer waiting
  state.
- **Deferred (separate tasks)**: a sidebar/section count of tasks waiting on
  the human; audio/browser notifications; auto-detecting "stuck" via timers;
  per-agent "stopped with question" parsing of the transcript.

## Related

- 0037 · Start/Pause (the mission this hardens)
- 0063 · the task whose agent skipped the main-copy sync and whose stop was
  indistinguishable from being stuck (primary evidence)
- 0066 · serve auto-reload (orthogonal; both reduce "silent" states)
- 0053 · keep agent logs/chat available in review (the chat the human replies in)

## Activity

- 2026-08-11T01:27:41Z · status ready→active

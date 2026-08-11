---
id: "0075"
title: Make move-to-done non-blocking and cut duplicate build/browser launches
type: feature
status: active
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/make-move-to-done-non-blocking-and-cut-d
created_at: "2026-08-11T05:10:50Z"
updated_at: "2026-08-11T12:18:32Z"
---
## Activity

- 2026-08-11T05:10:50Z · created · unknown
- 2026-08-11T05:24:19Z · status inbox→ready


## Problem

The review → done close-out (`completeTask` in `src/server/done.ts`, driven by
`POST /api/tasks/:id/done`) holds the HTTP request open for the entire
merge + build + screenshots + `repoos check` pipeline, measured at ~21s
uncontended (worse under concurrent agent load — one run took ~90s). Two
things follow from that:

1. **It feels stuck even when it isn't.** A slow tab, a flaky network blip,
   or a client-side timeout makes the click look like it did nothing —
   because it *is* nothing, from the UI's perspective, until the whole
   `await completeTask(...)` resolves. Confirmed directly: a `curl --max-time
   15` on `#0067` timed out client-side, but the server kept working and
   completed the merge ~90s later with no user-visible signal in the
   meantime. The SSE `task.progress` stream already exists (the earlier
   "stream live progress during move-to-done" fix) and is fully capable of
   reporting status independently of the HTTP response — it's just not used
   that way; the response is still blocking.
2. **Real, measured duplication of work inside the pipeline** (not merely
   perceived slowness):
   - `bun run build` runs once explicitly in `completeTask` (~2.9s), then
     `repoos check` unconditionally rebuilds from scratch again as its own
     first step — pure waste, ~3s every time.
   - Screenshot capture (`scripts/capture-screenshots.mjs`) launches its own
     headless browser + ephemeral server; `repoos check`'s UI smoke test
     (`runUISmokeTest` in `src/commands/check.ts`) launches a **second**,
     separate browser + ephemeral server for the same purpose (verifying the
     built UI). Two full browser/server launch cycles where one could serve
     both jobs.

## Desired UX

- Clicking "Move to done" gets an immediate acknowledgement (queued/started),
  not a multi-second blocking wait on the fetch promise. Progress after that
  point is driven entirely by the existing SSE `task.progress` events.
- A page refresh or reconnect while a done-flow is in progress still shows
  accurate current-step progress — the state isn't only held in an in-memory
  fetch promise on one browser tab.
- The pipeline itself is measurably faster: no redundant full rebuild, and
  screenshot capture + the UI smoke test share one browser/server launch
  instead of two.

## Acceptance criteria

- [ ] `POST /api/tasks/:id/done` responds immediately (e.g. 202 + `{ started:
      true }`) once pre-flight checks pass (task is `review`, has a branch,
      no agent turn in progress), then runs `completeTask` detached from the
      request/response cycle.
- [ ] Final outcome (success, or failure with reason/conflicts/step-reached)
      is delivered via the SSE stream (extend `task.progress` or add a
      terminal `task.done-result` event) — the frontend must not need to poll.
- [ ] `TaskDrawer.vue`'s move-to-done UI is rewired to the fire-and-forget
      shape: shows progress from SSE only, no longer awaits the POST body for
      the outcome. Reconnecting or refreshing mid-flow still reflects the
      correct current step (read from server-held state, not just the
      client's own fetch).
- [ ] `completeTask` builds once; `repoos check`'s internal "Full build" step
      is skippable when the caller already just built with nothing changed
      since (an internal flag/env var is fine — do not weaken `repoos check`
      run standalone from the CLI, which must still always build).
- [ ] Screenshot capture and the UI smoke test share a single browser +
      server launch instead of two independent ones. If a full merge isn't
      practical in scope, at minimum reuse the same ephemeral server (still
      two browser launches is acceptable as a partial win — call this out
      explicitly in the PR if you scope it down).
- [ ] Two concurrent `/done` requests for the same task can't both run
      `completeTask` at once (there's currently no lock beyond the
      `runner.isRunning` agent-turn check, which doesn't cover this case).
- [ ] `repoos check` passes; measure and note the before/after wall-clock
      time for a full move-to-done in the PR description.

## Notes for AI

- Files to touch: `src/server/done.ts`, `src/server/server.ts` (the `/done`
  route around the `actionMatch[2] === "done"` branch), `src/commands/check.ts`
  (`cmdCheck` / `runUISmokeTest`), `scripts/capture-screenshots.mjs`,
  `src/ui-app/src/components/TaskDrawer.vue`, `src/ui-app/src/stores/repo.ts`.
- **Sequence after #0069, not before.** #0069 ("Surface mutation errors
  visibly and stop branch drift from blocking move-to-done") is being
  implemented concurrently and touches the same done-flow surface: toast
  errors on mutation failure, a fast conflict pre-flight before the expensive
  build/check, inline done-failure detail in the drawer, and auto-sync of
  `main` into a task's branch on transition to `review`. Do not start this
  task until #0069 has merged to `main` — check `git log main -- src/server/done.ts
  src/server/server.ts src/ui-app/src/components/TaskDrawer.vue` for #0069's
  merge commit first, and rebase this work on top of it rather than working
  from a stale `main`. Expect the pre-flight conflict check from #0069 to
  become the natural first step before the async kickoff this task adds.
- Don't change the conflict-resolution or auto-merge semantics in
  `mergeBranch`/`autoResolve` — that's #0069's territory, not this task's.
  This task is about the request/response lifecycle and pipeline redundancy,
  not merge correctness.
- Keep `repoos check` behaving identically when run standalone from the CLI
  (agents rely on it as the definition-of-done gate before requesting
  review) — any build-skip optimization must be opt-in and internal to the
  done-flow's own invocation, never the default CLI behavior.
- Verify with a real move-to-done on a real review task against a running
  `repoos serve`, not just unit tests — confirm the HTTP response returns
  fast, SSE events carry the flow to completion, and a browser refresh
  mid-flow still shows correct progress.

## Related

- 0069 · Surface mutation errors visibly and stop branch drift from blocking
  move-to-done — must merge first; this task builds on its pre-flight and
  drawer changes.
- 0047 · Add a Move-to-done action for review tasks (original implementation)
- 0053 · Keep agent logs and chat available in review state (SSE precedent)

## Activity

- 2026-08-11T08:15:51Z · status ready→active, branch
- 2026-08-11T06:45:00Z · blocked · Task explicitly requires #0069 to merge to main before this work starts. Checked: #0069 (`work/0069-surface-mutation-errors-visibly-and-stop.md`) is still `status: active` on branch `feat/0069-visible-errors-and-done-drift`, not merged into main (`git merge-base --is-ancestor` confirms not-an-ancestor; only "Merge branch 'main' into feat/0069-..." exists, i.e. main was merged into it, not the reverse). Waiting for #0069 to land before implementing.
- 2026-08-11T12:12:44Z · needs_input
- 2026-08-11T12:12:50Z · status active→ready
- 2026-08-11T12:13:03Z · status ready→active
- 2026-08-11T12:17:31Z · needs_input
- 2026-08-11T12:18:32Z · needs_input

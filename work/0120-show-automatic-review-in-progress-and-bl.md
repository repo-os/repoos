---
id: "0120"
title: Show automatic review in progress and block move-to-done until it finishes
type: feature
status: ready
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T05:13:23Z"
updated_at: "2026-08-12T05:13:23Z"
---
## Activity

- 2026-08-12T05:13:23Z · created · unknown


## Problem

When a task enters `review`, RepoOS may launch the configured automatic review
agent. The server already exposes this state from `GET /api/tasks/:id/review`
as `{ running: true, review: null }`, but the Work card and task drawer do not
make the in-progress review obvious. The task simply looks ready for human
sign-off, and **Move to done** remains clickable.

That creates two problems:

- the user cannot tell whether review is running, stalled, or absent; and
- clicking **Move to done** cancels the reviewer and begins destructive
  close-out before its report is available, defeating automatic review.

## Desired UX

- A review task with an active review agent visibly shows an animated
  **Reviewing…** state on its Work card and in the task drawer.
- The animation is visually distinct from engineer **Working** state but uses
  the existing activity-indicator language and reduced-motion behavior.
- **Move to done** is disabled while review is running, with explanatory text
  such as “Waiting for automatic review to finish.”
- When the report arrives or review fails/stops, the state updates live without
  requiring a refresh and the action becomes available again.
- The server independently rejects a done request while the reviewer is
  running, so stale or custom clients cannot bypass the UI guard.

## Acceptance criteria

- [ ] Work cards display an animated `Reviewing…` state when the automatic
      reviewer is running for that task.
- [ ] The task drawer shows the same state near the review report/action area,
      including accessible status text (`role=status` or equivalent).
- [ ] **Move to done** is disabled while automatic review is running and gives
      a clear tooltip/helper explanation.
- [ ] The `/done` server route returns `409` with a clear message when the
      task's review manager is currently running. It must not cancel the review
      or begin merge/build work.
- [ ] Review running/completed/failed transitions are delivered through the
      existing SSE/store path so card and drawer update live after refresh or
      reconnect; do not rely only on state local to the clicked drawer.
- [ ] Tasks with review disabled, no reviewer, a completed report, or a failed
      review are not permanently blocked. The UI clearly distinguishes “no
      automatic review” from “review currently running.”
- [ ] Prevent duplicate review launches and handle a task leaving `review`
      while its reviewer is running without leaving a stuck animation.
- [ ] Animation respects `prefers-reduced-motion` and does not cause card
      layout shift.
- [ ] Tests cover card state, drawer/button state, live transition on review
      completion/failure, refresh hydration, and the server-side `409` guard.
- [ ] `repoos check` passes.

## Notes for AI

- Existing server state lives in `ReviewManager` and the
  `GET /api/tasks/:id/review` route. Prefer exposing one authoritative review
  status through RepoOS events/index data over polling every task card.
- Likely touch points: `src/server/review.ts`, `src/server/server.ts`,
  `src/server/live-index.ts`, `src/ui-app/src/stores/repo.ts`, Work card and
  task drawer components, plus focused server/store/component tests.
- Do not conflate automatic agent review with task `status: review`: the latter
  is the human sign-off stage, while the former is a transient activity within
  that stage.
- Do not fold this into #0118. #0118 serializes publication after sign-off;
  this task prevents sign-off from racing the reviewer.

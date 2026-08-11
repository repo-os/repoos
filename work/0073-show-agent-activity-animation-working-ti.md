---
id: "0073"
title: "Show agent activity animation, working time, and stall alert in the chat panel"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T04:14:02Z"
updated_at: "2026-08-11T04:14:02Z"
---
## Problem

The per-task Agent tab (0042) streams the agent's raw log, but gives no
ambient signal about what's actually happening. There's no indication that
the agent is *actively* working right now versus idle, no sense of how long
the task has taken in agent time, and nothing to warn the user if the agent
silently stops producing output — a hung or crashed process that never emits
`agent.exited` looks identical to one that's quietly thinking. The user has
to stare at the raw log and guess.

## Desired UX

- While the agent is actively producing output, the Agent tab (and the
  running badge on the task card) shows a working animation — a clear,
  ambient "the agent is alive and doing something" signal, distinct from the
  idle/stopped state.
- The Agent tab shows the total working time for the task: cumulative time
  the agent has spent actively running, **not** counting time spent waiting
  for human input (e.g. between turns, or while the session sits idle
  waiting for the next chat message).
- If the agent produces no activity for 20 seconds while it's still believed
  to be running, the UI treats it as stopped/died and alerts the human with
  a clear, visible warning — the working animation stops and a "may have
  stopped responding" style message appears.
- The alert clears automatically once new output arrives (it was a slow
  step, not a hang) or once the session is confirmed exited/stopped.

## Acceptance criteria

- [ ] Agent tab shows an animated "working" indicator while the agent is
      actively producing output; the indicator stops when the agent is idle
      or has exited.
- [ ] A total working time is tracked and displayed per task, accumulating
      only while the agent is actively running — it excludes time spent
      waiting for human input between turns.
- [ ] Working time accumulates correctly across multiple turns (e.g.
      follow-up chat messages per 0042 phase 2) — each turn adds to the same
      running total rather than resetting it.
- [ ] If 20 seconds pass with no new agent output while the runner still
      considers the agent running, the UI surfaces a clear stalled/dead
      alert.
- [ ] The stalled alert clears automatically once new output arrives, or
      once the session is confirmed exited/stopped.
- [ ] Zero console errors in the UI; `repoos check` passes.

## Notes for AI

- Builds directly on 0042 (Agent tab, `agent.output` / `agent.running` /
  `agent.exited` SSE events, the `AgentRunner` registry) and 0053 (logs/chat
  surviving `active` → `review`). Reuse those events and the running
  registry — do not change the spawn/resume/stop contract, this task is
  observability only.
- "Working" must track actual activity (arrival of `agent.output` events),
  not just "a process is running" — a hung process that stops emitting
  output but hasn't exited is exactly the case the 20s alert is meant to
  catch.
- Assumption (state if you diverge): working time = time between the agent
  starting a turn (`agent.running`, or first output of that turn) and the
  earlier of `agent.exited` or a detected 20s stall, summed across turns.
  Time between one turn ending and the human sending the next chat message
  is "waiting for human input" and does not count.
- 20s stall threshold: reset a per-task last-activity timestamp on every
  `agent.output` event; if it goes stale by 20s while the task is still
  marked running, treat as stalled. Clear on `agent.exited`. Implement the
  timer wherever is more natural (server-side alongside the runner registry,
  or client-side off the SSE stream) — server-side is likely more robust
  since it works even if no client has the tab open, but pick a reasonable
  default and note the choice.
- Persistence: no requirement to persist working time across a server
  restart — in-memory per-session tracking is acceptable. Note this
  assumption if you take it.
- Alerting is in-UI only (banner/indicator in the Agent tab); no email/push
  notifications are in scope.
- Likely touch points: `src/server/agents.ts` (timestamp tracking, stall
  detection), `src/server/server.ts` (SSE plumbing if a new event type is
  needed), `src/ui-app/src/stores/repo.ts`, `src/ui-app/src/types.ts`,
  `src/ui-app/src/components/TaskDrawer.vue`, `src/ui-app/src/components/TaskCard.vue`.
- Extend tests alongside existing patterns in
  `src/ui-app/tests/repo-store.test.ts` and `src/ui-app/tests/agent-drivers.test.ts`.

## Scope

- Covers: a working animation, a cumulative working-time display, and a
  20-second stall/death detection + alert, all within the existing Agent
  tab / task card UI.
- Deferred: any change to spawn/resume/stop mechanics, persisting working
  time across server restarts, and any notification channel outside the web
  UI itself.

## Related

- 0042 — added the per-task Agent tab with streaming output and session
  resume; this task builds its activity feedback on top of those events.
- 0053 — keeps agent logs and chat available during `review`; the animation,
  working time, and stall alert should behave consistently in that state too.

## Activity

- 2026-08-11T04:14:02Z · created · unknown

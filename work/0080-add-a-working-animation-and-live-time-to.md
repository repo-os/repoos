---
id: "0080"
title: Add a working animation and live time/tokens/cost counters to the Agent tab
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T06:25:10Z"
updated_at: "2026-08-11T06:25:10Z"
---
## Problem

The per-task Agent tab (0042) streams the agent's raw output but gives no
glanceable sense of what's actually happening. While the AI is working or
thinking there is no animated "it's alive" signal — just static log text — and
no live readout of how much time has been spent or how much the run is
consuming (tokens, cost). The user has to stare at the raw transcript and
guess whether the agent is making progress or quietly burning money.

Separately, once an agent has started working on a task (status `active` or
`review`), the drawer still opens on the Details tab, so the user has to click
over to the Agent tab every single time to see the live action.

## Desired UX

- While the agent is working/thinking, the Agent tab shows a clear animated
  indicator (e.g. pulsing dots or a spinner) — an ambient "the AI is alive and
  doing something" signal that stops when the agent is idle or has exited.
- The Agent tab shows a compact live stats readout whose numbers **increase in
  real time** as work proceeds:
  - time spent (counting up while the agent works),
  - tokens used (counting up as output arrives),
  - cost (counting up in lockstep with token usage).
- Any metric the underlying agent CLI does not report is hidden (or shown as
  "—") rather than displaying a wrong or broken value — the readout must never
  render `undefined`/`NaN`.
- Opening a task whose status is `active` or `review` defaults to the Agent
  tab, because the agent has started working and that's where the action is.
  Tasks in other statuses still open on Details.

## Acceptance criteria

- [ ] The Agent tab shows an animated "working/thinking" indicator while the
      agent is actively producing output; the indicator stops when the agent
      is idle or has exited.
- [ ] A time-spent counter counts up live while the agent works and keeps
      accumulating across turns (follow-up chat messages add to the same
      running total rather than resetting it).
- [ ] Token and cost counters increase live as new agent output arrives,
      sourced from usage/cost data in the agent's own output where the CLI
      reports it.
- [ ] When a metric is unavailable (CLI emits no usage data), that counter is
      hidden or shows "—" — never `undefined`, `NaN`, or a fabricated number.
- [ ] Opening any task whose status is `active` or `review` defaults to the
      Agent tab; opening tasks in other statuses still defaults to Details.
- [ ] Counters and the animation also work while the task sits in `review`
      (logs/chat persist there per 0053).
- [ ] Zero console errors in the UI; `repoos check` passes.

## Notes for AI

- Observability only: reuse the existing `agent.output` / `agent.running` /
  `agent.exited` SSE events and the `AgentRunner` registry. Do **not** change
  the spawn/resume/stop contract.
- **Overlap with 0073** (inbox): that task covers a working animation and a
  cumulative working-time display in the chat panel. If 0073 lands first,
  reuse its animation and elapsed-time plumbing here and scope this task to the
  token/cost counters plus the default-tab behavior. If it hasn't landed,
  implement the animation + time-spent here as specified and let 0073 defer to
  this work. Do not double-build the same thing.
- Token/cost is best-effort extraction from the agent's own output — e.g.
  claude code print-mode's cost summary on stderr, codex `--json` usage
  payloads, or a final usage line from opencode where one is emitted. Assumption
  stated: no provider API is called, no polling, no new runtime dependency
  (zero-runtime-deps is a hard constraint). If a CLI emits nothing usable, the
  related counters stay hidden.
- Counters are live/in-memory per session; persisting them across a server
  restart is explicitly out of scope. Note this assumption in the commit if you
  take it.
- Default-tab behavior lives in `src/ui-app/src/stores/ui.ts`: `activeTab`
  defaults to `"details"` in `open`/`openTask`/`close`. Set it to `"agent"`
  when the opened task's status is `active` or `review`. Watch for existing
  hard-coded agent-tab forces (`TaskCard.vue` ~line 114, `TaskDrawer.vue`
  ~lines 167/1133) and make the status-based default consistent with them.
- Likely touch points: `src/server/agents.ts` (usage/timestamp tracking,
  per-session counters), `src/server/server.ts` (SSE plumbing if a new event
  type is needed), `src/ui-app/src/types.ts`, `src/ui-app/src/stores/repo.ts`,
  `src/ui-app/src/stores/ui.ts`, `src/ui-app/src/components/TaskDrawer.vue`.
- Extend tests alongside existing patterns in
  `src/ui-app/tests/repo-store.test.ts` and `src/ui-app/tests/agent-drivers.test.ts`.
- After any UI change, rebuild (`bun run build:ui` for speed, or `bun run build`)
  and keep a `repoos serve` running (e.g. `repoos serve --port 7171`) so the
  user can view the changes; verify with a browser probe before reporting done.
  Run `repoos check` before moving to review. One task = one focused worktree.

## Scope

- Covers: the working/thinking animation, live time/tokens/cost counters on the
  Agent tab, and status-based default to the Agent tab for `active`/`review`
  tasks.
- Deferred: persisting usage/counters across a server restart, provider-level
  cost reporting beyond what the CLI already prints, and surfacing these
  counters anywhere outside the Agent tab.

## Related

- 0073 — working animation + cumulative working-time + stall alert (inbox);
  coordinate to avoid duplicating the animation/time work.
- 0042 — added the per-task Agent tab with streaming output; this task adds its
  activity/stats feedback and the default-tab behavior on top of those events.
- 0053 — keeps agent logs and chat available during `review`; the animation and
  counters must behave consistently in that state too.

## Activity

- 2026-08-11T06:25:10Z · created · unknown

---
id: "0080"
title: "Add agent run telemetry, default Agent tab, and an evidence-based stall warning"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-agent-run-telemetry-default-agent-ta
created_at: "2026-08-11T06:25:10Z"
updated_at: "2026-08-11T19:03:12Z"
---
## Problem

The per-task Agent tab (0042) streams the agent's raw output, and task 0049 now
provides a shared activity indicator, but the tab still has no compact readout
of elapsed time, tokens, or cost. The user has to inspect the transcript to
judge progress and resource use.

Separately, once an agent has started working on a task (status `active` or
`review`), the drawer still opens on the Details tab, so the user has to click
over to the Agent tab every single time to see the live action.

Also folded in from 0073 (closed as a duplicate of this task — see its
Activity log): there is nothing to warn the user if the agent silently stops
producing output. A hung or crashed process that never emits `agent.exited`
looks identical, from the UI, to one that's quietly thinking — confirmed live
this session on `#0069` and `#0077`, both of which sat hung on an unanswered
permission prompt for ~2 hours with zero commits before being killed by hand,
with nothing in the UI distinguishing that from normal slow progress.

## Desired UX

- While the agent is working/thinking, the Agent tab reuses the shared activity
  indicator delivered by 0049 rather than introducing a second animation.
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
- If the agent produces no new output for a conservative, configurable period
  (90 seconds by default) while the runner still reports it alive, the UI shows
  a neutral "quiet / may be stalled" warning. Silence alone must never be
  described as proof that a process is dead. The alert clears automatically
  once new output arrives (it was a slow step, not a hang) or once the
  session is confirmed exited/stopped.

## Acceptance criteria

- [ ] The Agent tab reuses the activity indicator from 0049 while the agent is
      working and does not add a competing animation implementation.
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
- [ ] If 90 seconds pass with no new `agent.output` event while the runner
      still considers the task running, the UI surfaces a clear, non-definitive
      quiet/may-be-stalled alert distinct from the normal working state.
- [ ] The stalled alert clears automatically once new output arrives, or
      once the session is confirmed exited/stopped.
- [ ] Zero console errors in the UI; `repoos check` passes.

## Notes for AI

- Observability only: reuse the existing `agent.output` / `agent.running` /
  `agent.exited` SSE events and the `AgentRunner` registry. Do **not** change
  the spawn/resume/stop contract.
- **0073 folded in here** (closed as a duplicate — see its Activity log for
  the pointer back to this task). Its unique piece was the stall alert,
  merged into Desired UX/Acceptance criteria above; everything else it asked
  for (working animation, cumulative working-time) was already in scope here.
  Implement all of it in this one task — do not split the animation/time work
  from the stall alert across two branches.
- Stall detection: reset a per-task last-activity timestamp on every
  `agent.output` event; if it goes stale by 90s while the task is still
  marked running, flag it as potentially stalled; clear on `agent.exited`.
  Combine output silence with process/runner state where available. Server-side
  (alongside the `AgentRunner` registry) is likely more robust than
  client-side off the SSE stream, since it still works with no client tab
  open — pick a reasonable default and note the choice if you diverge.
- "Working" must track actual activity (arrival of `agent.output`), not just
  "a process is running" — a hung process that stops emitting output but
  hasn't exited is exactly the case the stall alert exists to catch (this is
  not hypothetical: it happened twice in one session before the underlying
  cause — a missing CLI permission flag — was fixed).
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
  and use the managed, task-specific preview workflow from 0096. Request this
  task's preview via
  `curl -s -X POST "$REPOOS_API_URL/api/tasks/$REPOOS_TASK_ID/preview"` and probe
  the returned `url`; never run `repoos serve` yourself or pick a port. Verify
  the result before reporting done.
  Run `repoos check` before moving to review. One task = one focused worktree.

## Scope

- Covers: the working/thinking animation, live time/tokens/cost counters on the
  Agent tab, and status-based default to the Agent tab for `active`/`review`
  tasks.
- Deferred: persisting usage/counters across a server restart, provider-level
  cost reporting beyond what the CLI already prints, and surfacing these
  counters anywhere outside the Agent tab.

## Related

- 0073 — closed duplicate whose unique stall-warning scope is folded here.
- 0049 — delivered the shared activity indicator this task must reuse.
- 0042 — added the per-task Agent tab with streaming output; this task adds its
  activity/stats feedback and the default-tab behavior on top of those events.
- 0053 — keeps agent logs and chat available during `review`; the animation and
  counters must behave consistently in that state too.

## Activity

- 2026-08-11T06:25:10Z · created · unknown
- 2026-08-11T08:17:03Z · status inbox→ready
- 2026-08-11T15:37:46Z · updated · remove completed animation overlap and replace the 20-second dead inference with a conservative warning
- 2026-08-11T19:03:12Z · status ready→active, branch

---
id: "0174"
title: "CTO / Engineering-Manager agent: always-on board monitor with a chat panel"
type: feature
status: ready
priority: p2
area: server + ui-app
assigned_to: ai
created_by: ""
branch: feat/cto-engineering-manager-agent-always-on-
created_at: "2026-08-13T14:39:10Z"
updated_at: "2026-08-13T23:34:22Z"
---
## Problem
The board needs a pair of eyes that never sleeps. Today a human (or this session's manual loop) watches for stuck tasks, wedged finalization, review verdicts nobody acted on, zombie serve processes, and stale builds — then nudges agents, re-verifies gates, and files follow-up bugs by hand. That should be a first-class RepoOS agent: always on, monitoring, and un-sticking things — with a chat panel the human can talk to like a colleague.

## Vision
A configurable agent (proposed key `cto`, display "CTO") in the "Build Your Team" section, disabled by default, modeled on the `reviewer` agent but with an always-on monitor loop and a small, guard-railed action toolbox. It streams status updates into a persistent right-side chat panel and answers back-and-forth questions in plain language — "things similar to what the CTO tells the human" (board health, stuck tasks, what it's doing about them).

## Acceptance criteria
1. **Team config**: `cto` appears in the Agents/"Build Your Team" section with enable toggle, model picker, and a monitor interval setting. Disabled by default. Follows the `reviewer` config/plumbing precedent (`src/server/review.ts`, agents list in `src/core/config.ts`).
2. **Always-on monitoring**: when enabled, the server runs a monitoring loop — on a configurable cadence AND on key events (task status change, review run completes, agent turn exits) — that builds a compact board digest (tasks by status, stuck signals, session freshness, review verdicts, serve processes, build marker) and feeds it to the CTO session. The CTO decides whether to act or stay quiet; no chatter when nothing is wrong.
3. **Stuck-task detection**: the CTO can recognize the real stuck patterns from production, including: handoff requested but finalization never ran (session clean-exit, no `done` — the #0172 signature); task `active` with a dead/idle session for a long time; `review` verdict sitting with no bounce and no done; stale build marker (dist vs src); zombie/stale serve processes. It must be able to demonstrate un-sticking at least one such task end-to-end.
4. **Guard-railed actions** (server-enforced, never at the agent's own discretion to exceed): send a follow-up message to a task's agent session (same path as `POST /api/tasks/:id/message`) with a written plan the human sees; run `repoos check` on a worktree to verify before flipping status; move a task `review -> active` (or set `needs_input`) only when it is genuinely stuck; create a follow-up bug task (like #0168-#0172) for systemic issues. Forbidden: move to `done`, merge branches, delete worktrees/branches, change config, spend money, or modify files outside the repo. All actions are logged to the chat panel + activity feed, and every action is visible/reversible by the human.
5. **No interference**: the CTO must never duplicate a healthy agent's work — if a session is fresh and actively producing output, it leaves it alone (cooldowns + idempotence). It must not fire on the same stuck task repeatedly without new information.
6. **Chat panel**: a persistent right-side panel in the UI, global across the board (not per-task), streaming the CTO's turns over SSE (own reserved event id, like the reviewer's `review:` prefix in `src/server/review.ts:81`). Shows proactive reports with a small "last report" summary when the panel is closed (unread badge). Supports full back-and-forth chat; conversation is persisted like reviewer chat and survives server restarts.
7. **Prompt/playbook**: a strong system prompt teaching the CTO what to watch for (the stuck signatures above), how to prioritize, how to communicate concisely, and the action rules + escalation (when only a human can decide, say so plainly and mark the task `needs_input`).
8. `repoos check` green on the branch, including a UI smoke test covering the panel.

## Notes
- Closest existing patterns: `src/server/review.ts` (configured agent, separate session + SSE channel, read-only) and `src/server/task-watchdog.ts` (periodic server-side loop). The CTO is the "act" counterpart of the reviewer: same session/SSE separation, plus a monitor loop and the action toolbox.
- **Do NOT depend on fixed finalization (#0169/#0172) or the auto-bounce (#0173).** The message path works today even though resume-turn handoffs are dropped; verify state through gates and sessions, never through handoff signals.
- Race/contention awareness: when several worktrees run full test suites in parallel, timing-sensitive tests flake (the `agent-review.test.ts` 409/400 case). The CTO should verify under controlled conditions (staggered runs) and treat single flaky failures accordingly.
- The chat panel is Vue 3 SFCs in `src/ui-app`; follow existing drawer/streaming components. The CTO conversation should have its own persistence key, separate from task sessions.
- A human must be able to disable the CTO at any time from the Agents page; disabling kills the loop and keeps the chat read-only.
- Keep the CTO's budget bounded: cap monitor cadence, cap per-day nudges (e.g. configurable), and never auto-nudge more than a small number of tasks per pass without human confirmation.

## Activity

- 2026-08-13T14:39:10Z · created · unknown
- 2026-08-13T18:01:54Z · status ready→active, branch
- 2026-08-13T23:34:22Z · status active→ready

---
id: 1018
title: "Web UI renderer runs at up to 97% CPU when left open for days and may be loading the server: profile and fix runaway work (any browser, PWA or tab)"
type: bug
status: active
priority: p0
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/web-ui-renderer-runs-at-up-to-97-cpu-whe
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-11-03T15:28:57Z"
updated_at: "2026-11-03T18:16:39Z"
---
## Problem
On 2026-11-03 the RepoOS web UI had been open for about 1.5 days, installed as a Chrome PWA (its own Chrome profile) pointed at `http://127.0.0.1:7171`. A PWA is just the same web app in a standalone window, so treat this as a problem in the web app itself that will also affect an ordinary browser tab; it was only noticed in the PWA. Its renderer process (pid 34283) held 29–97% of a CPU the whole time and its GPU process (34243) another 30–66%, at about 640 MB. Over the same period the host load average reached 36–69, the RepoOS server on :7171 stopped answering, and `launchd` restarted it 7 times (last exit code 1). After the maintainer killed those two processes the load average dropped from ~36–55 to ~6.5 and the server stayed up. Cause not proven, but the timing is strong. Candidate causes: a runaway reactive/watch loop, SSE or polling that re-renders the whole board, an event-stream reconnect storm, unbounded growth of the task list or logs held in memory (640 MB), or per-card timers/animations that keep the GPU busy.

## Desired UX
An open board costs almost nothing when nothing is changing: renderer CPU near 0% when idle, bounded memory over days, and no load on the server beyond a light event stream. A long-lived tab or PWA can never degrade the host or the server.

## Acceptance criteria
- [ ] Reproduce: open the board with the real task count (hundreds of tasks) for a long idle period and record renderer CPU/memory over time (Chrome task manager or Playwright tracing). Record the finding in `docs/`.
- [ ] Find and fix the cause(s) (profile with the Performance panel: reactive loops, SSE handlers that replace whole stores, intervals/timers, CSS animations or blur layers that keep the GPU active).
- [ ] Add a regression check: an idle-board test or smoke step that fails if the UI's per-minute main-thread work or SSE-triggered re-render count exceeds a budget, and a test that the store does not grow without bound.
- [ ] Measure the server side too: request/event rate from one idle client, and that a reconnect storm backs off (jitter).
- [ ] When the tab is hidden, polling/animations pause.

## Notes for AI
Reproduce in a normal browser tab and in the PWA, and say whether the cost differs (it should not). Start with `src/ui-app/src/stores/repo.ts` (SSE/event handling and store updates), the board view and task card components (timers, animations), and the server's event stream route. Evidence is from the maintainer's machine on 2026-11-03. Do not use the maintainer's live Chrome profile for testing; use Playwright or a fresh profile.

## Activity

- 2026-11-03T15:28:57Z · created · njachowski@gmail.com
- 2026-11-03T15:30:04Z · title
- 2026-11-03T15:30:05Z · body: Problem (added 1, removed 1)
- 2026-11-03T15:30:07Z · body: Notes for AI (added 1, removed 1)
- 2026-11-03T16:46:59Z · review_cli_override
- 2026-11-03T16:47:01Z · review_model_override
- 2026-11-03T16:47:16Z · status inbox→ready
- 2026-11-03T16:47:20Z · status ready→active, branch
- 2026-11-03T16:57:10Z · message_queued at 2026-11-03T16:57:10.169Z
- 2026-11-03T16:57:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T17:02:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T17:40:41Z · engineer stopped by request
- 2026-11-03T17:41:47Z · message_delivered: 1 message(s)
- 2026-11-03T18:02:09Z · message_queued at 2026-11-03T18:02:09.694Z
- 2026-11-03T18:02:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T18:03:29Z · body
- 2026-11-03T18:07:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T18:13:23Z · body
- 2026-11-03T18:16:39Z · handoff_deferred: 1 queued message(s) must be read before review

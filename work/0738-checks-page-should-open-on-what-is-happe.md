---
id: "0738"
title: "Checks page should open on what is happening now (live runs), not the static Check plan tab"
type: feature
status: review
priority: p1
area: web
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/checks-page-should-open-on-what-is-happe
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T14:04:03Z"
updated_at: "2026-10-07T14:43:39Z"
last_check_failure: "repoos check at 2026-10-07T14:25:03.639Z: server-side finalization timed out (deadline exceeded)"
---
## Problem

Opening Checks lands on the 'Check plan' tab (src/ui-app/src/views/ChecksView.vue, default tab 'plan'), which is static configuration. The thing a person (or the CTO's escalations) needs on that page is what is running and what is queued right now: remote runs per host, the close-out queue, hung/slow runs. The owner had to click through to 'Remote runners' to see why close-outs were stuck.

## Desired UX

- The default tab is the live view. If anything is running, queued, hung or slow (remote runs, close-out pipeline, local checks), open on a live tab that shows it (Remote runners today; consider one 'Now' tab combining the close-out pipeline stage + queue + runner hosts + latest runs). If nothing is in flight, open on 'Runs' (the recent history), never on the static plan.
- 'Check plan' and 'Test suite' stay available as secondary tabs; `?tab=plan` still deep-links. Remember nothing in localStorage that overrides a deep link.
- The live tab shows the close-out pipeline (active task, stage, queued task ids) at the top so 'I clicked Move to done on three tasks, where are they?' is answered on the page, including 'waiting behind #0737 which is validating on thinkpad'.

## Acceptance criteria

- Tests: default tab is live when something is in flight, Runs when idle, deep links keep working; the pipeline strip renders active + queue. Uses the shared components. repoos check passes.

## Notes for AI

Read ChecksView.vue and the Remote runners panel (RemoteRunnersPanel.vue); the close-out pipeline snapshot is GET /api/integration/pipeline. Related: #0720, #0730.

## Shots
```json
[
  {
    "label": "Checks Now tab with close-out pipeline strip",
    "target": "default",
    "route": "/checks?tab=now",
    "highlight": ".ips"
  },
  {
    "label": "Checks idle default Runs tab",
    "target": "default",
    "route": "/checks?tab=runs",
    "highlight": ".ck-tabs"
  }
]
```

## Activity

- 2026-10-07T14:04:03Z · created · unknown
- 2026-10-07T14:04:12Z · cli_override, model_override
- 2026-10-07T14:04:15Z · status inbox→ready
- 2026-10-07T14:04:16Z · status ready→active, branch
- 2026-10-07T14:11:16Z · body: section Shots
- 2026-10-07T14:12:56Z · body
- 2026-10-07T14:13:37Z · body
- 2026-10-07T14:14:47Z · body: section Shots
- 2026-10-07T14:25:59Z · body
- 2026-10-07T14:26:22Z · status active→review
- 2026-10-07T14:26:22Z · status review→active
- 2026-10-07T14:36:22Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-07T14:37:17Z · status active→review
- 2026-10-07T14:37:17Z · status review→active
- 2026-10-07T14:43:00Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · server-side finalization timed out (deadline exceeded) · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T14:43:00Z · status review→active
- 2026-10-07T14:43:39Z · status active→review

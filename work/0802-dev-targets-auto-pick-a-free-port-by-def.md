---
id: "0802"
title: "Dev targets: auto-pick a free port by default, with a per-target fixed-port option"
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/dev-targets-auto-pick-a-free-port-by-def
created_at: "2026-10-15T19:36:15Z"
updated_at: "2026-10-16T02:23:38Z"
review_rounds: 1
review_passes: 1
---
## Problem
#0775 added the plain-language failure summary for a dev target whose port is taken, but not the automatic port choice it was asked to include. The three dev targets in repoos.toml now use the {port} placeholder, so they pick a free port, but nothing decides that for every target, and there is no setting for it.

## Desired UX
- Auto-pick a free port is ON by default for every dev target. When a target's port is taken, RepoOS starts it on a free port and shows the real URL prominently on the Dev page.
- A per-target setting turns auto-pick OFF and lets the user enter a fixed port. With auto-pick off, a port conflict fails with the summary, naming the process holding the port.
- Auto-pick never stops another process. Only processes RepoOS started may be stopped.

## Acceptance criteria
- Test: a target with a taken port and auto-pick on starts on a free port and reports that URL.
- Test: a target with auto-pick off and a taken port fails with the port-in-use summary.
- Test: auto-pick never stops a process RepoOS did not start.
- Every new setting has a Settings control with copy that says what happens when a port is taken (AGENTS.md).
- Dev page shows the chosen port and URL in light and dark themes.

## Notes for AI
Start from src/server/dev.ts (the {port} substitution, which already picks a free port at start time) and src/core/dev-failure.ts (the summary). Source: the 2026-10-16 dev target failure (Landing page on 5173), and #0775, which shipped the summary without the auto-pick.

## Shots
```json
[
{
"label": "Dev page: chosen port and real URL (light)",
"target": "default",
"route": "/dev?shotState=dev:running",
"highlight": ".dev-port",
"theme": "light"
},
{
"label": "Dev page: chosen port and real URL (dark)",
"target": "default",
"route": "/dev?shotState=dev:running",
"highlight": ".dev-port",
"theme": "dark"
},
{
"label": "Settings to Advanced: dev target auto-pick and fixed-port control",
"target": "default",
"route": "/settings?tab=advanced",
"highlight": "#dev-target-port",
"steps": [
{
"waitFor": "[aria-label=\"Edit Landing page (HMR)\"]"
},
{
"click": "[aria-label=\"Edit Landing page (HMR)\"]"
},
{
"waitMs": 300
}
]
}
]
```

## Activity

- 2026-10-15T19:36:15Z · created · njachowski@gmail.com
- 2026-10-16T00:43:55Z · status inbox→ready
- 2026-10-16T00:43:59Z · status ready→active, branch
- 2026-10-16T01:03:06Z · body
- 2026-10-16T01:19:38Z · message_queued at 2026-10-16T01:19:38.343Z
- 2026-10-16T01:19:38Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-16T01:55:15Z · body
- 2026-10-16T01:58:49Z · body: section Shots
- 2026-10-16T02:00:06Z · body
- 2026-10-16T02:07:43Z · status active→review
- 2026-10-16T02:07:55Z · note: click [aria-label^=Edit]: click: Error: strict mode violation: locator('[aria-label^=Edit]') resolved to 3 elements: on /settings?tab=advanced
- 2026-10-16T02:07:56Z · note: highlight #dev-target-port matched nothing on /settings?tab=advanced
- 2026-10-16T02:08:51Z · note: review pass 1: needs some work
- 2026-10-16T02:08:51Z · message_delivered: 1 message(s)
- 2026-10-16T02:08:51Z · status review→active
- 2026-10-16T02:13:23Z · body: section Shots
- 2026-10-16T02:14:16Z · body
- 2026-10-16T02:23:38Z · status active→review
- 2026-10-16T02:23:38Z · note: shots: skipped — 3 handoff shots already captured for this exact plan (1a9b848a0) during finalization (#0734)

---
last_close_out_gate_ms: 381279
last_close_out_gate_at: "2026-10-31T00:04:25.614Z"
id: "0985"
title: "Easter eggs bundle: task panel landing card padding, status card times, filename row"
type: chore
status: review
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-task-panel-landing-ca
created_at: "2026-10-30T09:32:06Z"
updated_at: "2026-10-31T00:04:25Z"
last_check_failure: "repoos check at 2026-10-30T16:41:38.708Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Review failure status cards with ages and full-time tooltip (target \"default\"): hover .debug-status-detail:first-child .debug-status-time: hover: Timeout 5000ms exceeded. on /work?task=9999&tab=debug (http://127.0.0.1:50515/work?shotState=drawer:statusDetails)"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Items

- [ ] **E1 · Not-landable card padding** (web) — fix the padding on the red "Not landable" card above the drawer tabs so it matches the other cards. Source: human report.
- [ ] **E2 · Status details card times** (web) — each Status details card shows a human-readable age (e.g. "6 minutes ago", "2 hours ago") in its upper right corner; hover shows the full timestamp in a styled popover. Source: human report.
- [ ] **E3 · Task filename row** (web) — in the drawer's top row drop the `work/` prefix from the filename and keep it to one line with an ellipsis on overflow; hover shows the full filename in a styled popover, not a native title tooltip. Source: human report.

Every item uses the same sub-headings below; edit items with `repoos update --section`, never a full `--body`.

## E1 · Not-landable card padding

### Problem
The red card above the tabs (see screenshot) has uneven/too tight padding for its text.

### Desired UX
Padding consistent with other drawer cards.

### Acceptance criteria
- [ ] Card padding is even on all sides and matches neighbouring cards.

### Notes for AI
Web only. Use the shared styles in `src/ui-app/src/style.css` where they exist. Add a test or a declared shot.

## E2 · Status details card times

### Problem
Status details cards (Waiting for you, Not landable checklist, Awaiting review guidance, Latest check result) show no time.

### Desired UX
A relative time ("6 minutes ago") sits in each card's upper right; hover shows the full timestamp.

### Acceptance criteria
- [ ] Each card with a known timestamp shows a relative time in the upper right.
- [ ] Hover or keyboard focus shows the full timestamp in a styled popover (no native `title`).
- [ ] Cards with no timestamp show nothing.

### Notes for AI
Reuse any existing relative-time helper and the shared tooltip/popover. Add a unit test for the formatting.

## E3 · Task filename row

### Problem
The filename in the drawer's top row shows `work/…` and wraps to two lines.

### Desired UX
Filename without the `work/` prefix, one line, ellipsis on overflow, full name in a styled popover on hover.

### Acceptance criteria
- [ ] No `work/` prefix is shown.
- [ ] The name never wraps; overflow shows an ellipsis.
- [ ] Hover or focus shows the full filename in a styled popover (no native `title`).

### Notes for AI
Web only. Keep the popover keyboard- and touch-usable.

## Screenshots

![Task panel: red Not landable card, Status details cards, filename row](/api/tasks/0985/attachments/att_bb47a999-6529-404e-ade3-e55023463b71.webp)

## Shots
```json
[
{
"label": "Review failure status cards with ages and full-time tooltip",
"target": "default",
"route": "/work?task=9999&tab=debug",
"highlight": ".debug-status-detail",
"steps": [
{
"hover": ".debug-status-detail:has-text(\"Reviewer failed\") .debug-status-time"
}
],
"state": "drawer:statusDetails"
},
{
"label": "Task filename row with full path tooltip",
"target": "default",
"route": "/work?task=9999&tab=debug",
"highlight": ".drawer-task-filename",
"steps": [
{
"hover": ".drawer-task-filename"
}
],
"state": "drawer:statusDetails"
},
{
"label": "Not-landable card padding above drawer tabs",
"target": "default",
"route": "/work?task=9999",
"highlight": ".drawer-status-summary",
"state": "drawer:landable"
}
]
```

## Activity

- 2026-10-30T09:32:06Z · created · njachowski@gmail.com
- 2026-10-30T09:32:07Z · screenshots
- 2026-10-30T09:32:14Z · status inbox→ready
- 2026-10-30T15:20:50Z · status ready→active, branch
- 2026-10-30T15:25:17Z · body
- 2026-10-30T16:00:32Z · status active→review
- 2026-10-30T16:00:34Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a58f63587) during finalization (#0734)
- 2026-10-30T16:01:25Z · note: review pass 1: needs some work
- 2026-10-30T16:01:26Z · status review→active
- 2026-10-30T16:04:02Z · body
- 2026-10-30T16:29:53Z · note: ui verification failed (1 issue(s)): [missing-target] Review failure status cards with ages and full-time tooltip (target "default"): hover .debug-status-time: hover: Error: strict mode violation: locator('.debug-status-time') resolved to 2 elements: on /work?task=9999&tab=debug (http://127.0.0.1:49499/work?shotState=drawer:statusDetails)
- 2026-10-30T16:30:24Z · body
- 2026-10-30T16:41:35Z · note: ui verification failed (1 issue(s)): [missing-target] Review failure status cards with ages and full-time tooltip (target "default"): hover .debug-status-detail:first-child .debug-status-time: hover: Timeout 5000ms exceeded. on /work?task=9999&tab=debug (http://127.0.0.1:50515/work?shotState=drawer:statusDetails)
- 2026-10-30T16:42:09Z · body
- 2026-10-30T16:52:50Z · status active→review
- 2026-10-30T16:52:52Z · note: shots: skipped — 3 handoff shots already captured for this exact plan (5a0f58242) during finalization (#0734)
- 2026-10-30T16:53:47Z · note: review pass 2: good to go
- 2026-10-31T00:04:25Z · close-out gate completed in 381s


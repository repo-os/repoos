---
updated_at: "2026-10-30T16:01:25Z"
review_passes: 1
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
"label": "Status cards with timestamp ages and filename row",
"target": "default",
"route": "/work?task=0985&tab=debug",
"highlight": ".debug-status-detail",
"steps": [
{
"waitMs": 300
}
],
"state": "drawer:statusDetails"
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


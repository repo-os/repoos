---
id: "0778"
title: "Easter eggs bundle: Shots validator and review card wording"
type: bug
status: active
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-shots-validator-and-r
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-14T07:43:09Z"
updated_at: "2026-10-14T08:53:42Z"
review_rounds: 1
review_passes: 1
---
## Problem
Small cosmetic and validation bugs found on 2026-10-14. They are bundled because each is small and independent.

1. Shot can't be deleted when its state is invalid. A task whose ## Shots list contains an unknown state fixture (for example board:cardChips on #0776) fails the Shots validator. The UI then refuses to delete any shot on that task ('the task's ## Shots section is not a valid list — fix it before deleting'), so the bad shot can't be removed.
2. Duplicate text on the 'Waiting for you' card. src/server/review.ts ~1675 writes the same sentence to needsInputDetail as to the reason, so the card shows it twice.
3. The Repo Context page has no way to open the open doc in an editor. The task Spec section already has an 'Open in editor ↗' link at the top right of the box; the doc viewer should use the same link and styling.
4. On the Changes tab, the 'Add shot' and 'Refresh evidence' buttons are not right-aligned. Both should be pulled to the right, with 'Add shot' as the rightmost button.

## Desired UX
- Deleting a shot works even when other entries on the task are invalid. Validate only what is being written, and let the user remove the invalid entry.
- The Waiting-for-you card shows the reason once. The detail carries something different (for example the last review's verdict line), or is hidden when it would repeat the reason.
- The Repo Context doc viewer has an 'Open in editor ↗' link in the same place and style as the task Spec section.
- On the Changes tab toolbar, 'Refresh evidence' sits to the right of the section label, with 'Add shot' furthest right.

## Acceptance criteria
- Test: deleting a shot on a task with one invalid entry succeeds and removes only the selected entry.
- Test: the Waiting-for-you card shows the reason once when the detail would repeat it.
- CLI: repoos update --shots '[]' is rejected ('expected at least one shot'). Either accept an empty list to clear all shots, or document the --section Shots --section-body '' way.
- Repo Context doc viewer shows the Open in editor link, matching the task Spec styling, in light and dark themes.
- Changes tab buttons are right-aligned in that order, checked in light and dark themes.

## Notes for AI
Source: user reports 2026-10-14 on #0776 (shot delete error), the Waiting-for-you card, the Repo Context doc viewer, and the Changes tab toolbar. Items are small and independent; commit per item so a reviewer can read them separately.

## Shots
```json
[
{
"label": "Context Open in editor (light)",
"target": "default",
"route": "/repo?doc=docs/README.md",
"highlight": "[data-test-id=\"context-open-in-editor\"]",
"steps": [
{
"waitFor": ".doc-view-head"
}
]
},
{
"label": "Context Open in editor (dark)",
"target": "default",
"route": "/repo?doc=docs/README.md",
"highlight": "[data-test-id=\"context-open-in-editor\"]",
"steps": [
{
"waitFor": ".doc-view-head"
},
{
"click": ".theme-toggle"
},
{
"waitMs": 400
}
]
},
{
"label": "Changes UI toolbar (light)",
"target": "default",
"route": "/work?task=0778&tab=changes",
"highlight": ".changes-summary-actions",
"steps": [
{
"waitFor": ".changes-tabs"
},
{
"click": "[data-test-id=\"changes-tab-ui\"]"
},
{
"waitMs": 400
}
]
},
{
"label": "Changes UI toolbar (dark)",
"target": "default",
"route": "/work?task=0778&tab=changes",
"highlight": ".changes-summary-actions",
"steps": [
{
"waitFor": ".changes-tabs"
},
{
"click": "[data-test-id=\"changes-tab-ui\"]"
},
{
"click": ".theme-toggle"
},
{
"waitMs": 400
}
]
}
]
```

## Activity

- 2026-10-14T07:43:09Z · created · njachowski@gmail.com
- 2026-10-14T07:43:10Z · needs_input
- 2026-10-14T07:43:20Z · body
- 2026-10-14T08:04:32Z · needs_input
- 2026-10-14T08:21:11Z · status inbox→ready
- 2026-10-14T08:26:02Z · body
- 2026-10-14T08:27:02Z · cli_override, model_override
- 2026-10-14T08:27:02Z · cli_override
- 2026-10-14T08:27:05Z · cli_override
- 2026-10-14T08:27:06Z · model_override
- 2026-10-14T08:27:10Z · review_cli_override, review_model_override
- 2026-10-14T08:27:12Z · status ready→active, branch
- 2026-10-14T08:37:39Z · body
- 2026-10-14T08:38:30Z · body
- 2026-10-14T08:39:12Z · body: section Shots
- 2026-10-14T08:45:08Z · status active→review
- 2026-10-14T08:45:47Z · note: highlight .changes-summary-actions matched nothing on /work?task=0778&tab=changes
- 2026-10-14T08:47:18Z · note: review pass 1: needs some work
- 2026-10-14T08:47:19Z · status review→active
- 2026-10-14T08:48:56Z · body: section Shots
- 2026-10-14T08:49:41Z · body
- 2026-10-14T08:51:49Z · body
- 2026-10-14T08:53:42Z · body

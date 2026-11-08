---
id: "1066"
title: "Pipeline view: card text uses --muted (a background token), unreadable in every theme"
type: bug
status: ready
paths: [src/ui-app/src/components/PipelineCard.vue, src/ui-app/src/style.css]
priority: p1
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/pipeline-view-card-text-uses-muted-a-bac
created_at: "2026-11-08T13:13:52Z"
updated_at: "2026-11-08T14:54:02Z"
handoff_signal_retry_count: 2
deferred_handoff_resume_count: 1
---
## Problem
On the Work > Pipeline view, the task id, type/priority chips, elapsed time, model/agent line and host label on every card are almost invisible, in every theme (light and dark). The Board view is fine.

Cause: `PipelineCard.vue` sets `color: var(--muted)` on `.pl-id`, `.pl-chip`, `.pl-elapsed` and `.pl-row-4` (lines ~221, 230, 280, 305). In this design system `--muted` is the shadcn-style muted SURFACE (background) token: `--muted: #0b1020` in the default dark theme, `#eef0f6` in light, with matching near-background values in every theme block of `style.css`. Text colored with it is nearly the same color as the card background (`--panel-solid`). The text tokens are `--txt-dim`, `--txt-faint` and `--muted-foreground`. The same misuse is in `style.css` `.model-test-summary` and `.model-test-not_testable` (~13268, 13292).

## Desired UX
Every piece of text on a Pipeline card is readable in every theme, light and dark: secondary text (id, chips, elapsed time, model and host) is clearly dimmer than the title but legible, the same way it looks on the Board view.

## Acceptance criteria
- Pipeline card secondary text uses `--txt-dim` (or `--muted-foreground`) so it is readable in all themes; check every theme block in style.css.
- The same fix applied to the two `.model-test-*` rules.
- Add a guard so `color: var(--muted)` (as text) cannot come back: extend the existing hard-coded-color / theme-contrast guard or add a test that fails on `color: var(--muted)` outside deliberate surface uses.
- The rendered contrast audit (part of `repoos check`) covers the Pipeline view, or a declared `repoos shot` of `/work` Pipeline in one dark and one light theme shows the fix.

## Notes for AI
Reported with a screenshot from the tiao project; titles are readable but id, chips, elapsed time and the "model · host" row are not. Do not change `--muted` itself (it is correct as a surface token and used elsewhere); change the text color tokens at the call sites. Check the other pipeline components (PipelineView, stage panes) for the same pattern.

## Shots
```json
[
{
"label": "Pipeline card secondary text (dark theme)",
"target": "default",
"route": "/work",
"highlight": ".pipeline-card",
"assert": [
{
"selector": ".pl-id",
"label": "task id is visible"
},
{
"selector": ".pl-row-4",
"label": "model and host row is visible"
}
],
"state": "pipeline:checksProgress",
"theme": "dark"
},
{
"label": "Pipeline card secondary text (light theme)",
"target": "default",
"route": "/work",
"highlight": ".pipeline-card",
"assert": [
{
"selector": ".pl-id",
"label": "task id is visible"
},
{
"selector": ".pl-row-4",
"label": "model and host row is visible"
}
],
"state": "pipeline:checksProgress",
"theme": "light"
}
]
```

## Activity

- 2026-11-08T13:13:52Z · created · njachowski@gmail.com
- 2026-11-08T13:13:52Z · needs_input
- 2026-11-08T13:13:55Z · needs_input
- 2026-11-08T13:15:51Z · body: Problem (added 1, removed 2); Desired UX (added); Acceptance criteria (added 1, removed 1)
- 2026-11-08T13:40:06Z · status inbox→ready
- 2026-11-08T14:16:58Z · status ready→active, branch
- 2026-11-08T14:22:39Z · message_queued at 2026-11-08T14:22:39.911Z
- 2026-11-08T14:27:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T14:32:07Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T14:40:44Z · body
- 2026-11-08T14:46:44Z · body
- 2026-11-08T14:53:14Z · body
- 2026-11-08T14:54:02Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T14:54:02Z · message_queued at 2026-11-08T14:54:02.724Z

---
id: "1066"
title: "Pipeline view: card text uses --muted (a background token), unreadable in every theme"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX"
paths: [src/ui-app/src/components/PipelineCard.vue, src/ui-app/src/style.css]
priority: p1
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-08T13:13:52Z"
updated_at: "2026-11-08T13:13:52Z"
---
## Problem
On the Work > Pipeline view, the task id, type/priority chips, elapsed time, model/agent line and host label on every card are almost invisible, in every theme (light and dark). The Board view is fine.

Cause: `PipelineCard.vue` sets `color: var(--muted)` on `.pl-id`, `.pl-chip`, `.pl-elapsed` and `.pl-row-4` (lines ~221, 230, 280, 305). In this design system `--muted` is the shadcn-style muted SURFACE (background) token: `--muted: #0b1020` in the default dark theme, `#eef0f6` in light, with matching near-background values in every theme block of `style.css`. Text colored with it is nearly the same color as the card background (`--panel-solid`). The text tokens are `--txt-dim`, `--txt-faint` and `--muted-foreground`.

The same misuse is in `style.css` `.model-test-summary` and `.model-test-not_testable` (~13268, 13292).

## Acceptance criteria
- Pipeline card secondary text uses `--txt-dim` (or `--muted-foreground`) so it is readable in all themes, light and dark; check every theme block in style.css.
- The same fix applied to the two `.model-test-*` rules.
- Add a guard so `color: var(--muted)` (as text) cannot come back: extend the existing hard-coded-color / theme-contrast guard or add a test that fails on `color: var(--muted)` outside deliberate surface uses.
- The rendered contrast audit (part of `repoos check`) covers the Pipeline view, or a declared `repoos shot` of `/work` Pipeline in one dark and one light theme shows the fix.

## Notes for AI
Reported with a screenshot from the tiao project; titles are readable but id, chips, elapsed time and the "model · host" row are not. Do not change `--muted` itself (it is correct as a surface token and used elsewhere); change the text color tokens at the call sites. Check the other pipeline components (PipelineView, stage panes) for the same pattern.

## Activity

- 2026-11-08T13:13:52Z · created · njachowski@gmail.com
- 2026-11-08T13:13:52Z · needs_input

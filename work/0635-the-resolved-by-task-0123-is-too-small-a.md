---
updated_at: "2026-10-03T08:23:24Z"
review_passes: 1
id: "0635"
title: Make resolved-by-task indicator prominent on input drawer
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-resolved-by-task-indicator-prominen
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-03T08:02:53Z"
---
## Problem

When an input has been processed and linked to a task, the input detail drawer shows **Resolved by** with a link such as **task #0123**. Today that block uses small secondary body text (`12px`, `var(--txt-secondary)`) and sits as a single understated line under the status controls. That resolution link is one of the most important facts about a processed input—users need to see immediately which task absorbed the work—but it is easy to miss compared with status, metadata, and the input body.

## Desired UX

Opening a **processed** input whose resolution is **task** should make the linked task impossible to overlook at a glance.

- The **Resolved by task #…** affordance reads as a primary outcome, not fine print: stronger visual weight (type size, contrast, and/or a compact callout or badge) while staying consistent with RepoOS drawer styling and theme tokens.
- The task id remains a clear, keyboard-focusable control that navigates to the task (same behavior as today’s `goToTask` / `resolution-link`).
- **No action taken** and **No resolution recorded** states for other processed resolutions should remain legible but need not be promoted to the same level as a task link unless the layout naturally groups them.

Assumption: prominence work targets the **input detail drawer** first; the inputs list/board does not currently surface `resolvedTask`, so list-card changes are optional only if a low-cost hint fits without scope creep.

## Acceptance criteria

- [ ] For a processed input with `resolution: task` and a non-empty `resolvedTask`, the drawer shows **Resolved by** and the **task #…** link with visibly stronger hierarchy than the current `12px` secondary line (verified in light and dark theme).
- [ ] Clicking the task link still opens/navigates to that task; focus and hover states remain accessible (visible focus ring, sensible hit target).
- [ ] Processed inputs with `resolution: none` still show **No action taken.** Processed inputs with missing/unknown resolution still show **No resolution recorded.** Copy and behavior unchanged aside from any shared layout wrapper.
- [ ] Non-processed inputs do not show the resolution block (unchanged).
- [ ] Existing test **a processed input renders its task link after a reload** in `input-resolve.test.ts` still passes; extend or add a test if the DOM structure or classes change materially.
- [ ] `bun run fmt` and `repoos check --changed main` pass after UI rebuild (`bun run build:ui`).

## Notes for AI

- **Primary file:** `src/ui-app/src/views/InputsView.vue` — template block `.detail-resolution` (~lines 454–467) and scoped styles `.detail-resolution` / `.resolution-link` (~786–807). Today: `font-size: 12px`, `color: var(--txt-secondary)`, link styled as inline text with `ExternalLink` at `size-3.5`.
- Reuse shared utilities from `src/ui-app/src/style.css` where possible (e.g. notice/tint patterns, `.kv-rows` only if it fits); avoid hard-coded colors; respect contrast audit exemptions only when necessary (`docs/contrast-audit.md`).
- Do **not** change input resolution semantics, API fields, or when `resolvedTask` is written—this is presentation only.
- Follow AGENTS.md: no native `confirm`/`alert`; dialogs unchanged here. Teleport/`data-overlay-layer` rules apply only if adding overlays.
- Task **#0635** may include a screenshot of the current drawer; use it as before/after reference.

## Scope

In scope: visual and layout treatment of the resolution row in the input detail drawer for processed inputs.

Out of scope: enriching the inputs list with resolved-task columns, changing PM resolve flows, or redesigning the whole input drawer.

## Related

- Input resolution store/API: `input-resolve.test.ts`, `resolveInput` behavior
- Draft/input record: task **#0635** (same user report)

## Original prompt

The "Resolved by Task #0123" is too small and easy for the user to miss seeing, please make it more obvious because it's one of the most important things on an input.

## Screenshots

![Screenshot-2026-10-03-at-16.01.03](/api/tasks/0635/attachments/screenshot-1.png)

## Shots
```json
[
  {
    "label": "Input drawer: promoted \"Resolved by task\" callout",
    "target": "default",
    "route": "/inputs?input=0021",
    "highlight": ".detail-resolution"
  }
]
```

## Activity

- 2026-10-03T08:02:53Z · created · hello@repoos.org
- 2026-10-03T08:02:54Z · screenshots
- 2026-10-03T08:03:18Z · status draft→inbox, title, area, body
- 2026-10-03T08:08:37Z · model_override
- 2026-10-03T08:08:40Z · review_cli_override
- 2026-10-03T08:08:41Z · review_model_override
- 2026-10-03T08:08:42Z · status inbox→ready
- 2026-10-03T08:08:44Z · status ready→active, branch
- 2026-10-03T08:17:00Z · body: section Shots
- 2026-10-03T08:22:57Z · status active→review


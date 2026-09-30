---
updated_at: "2026-09-30T17:38:46Z"
review_passes: 1
id: "0608"
title: Match New task screenshot uploads to New input panel
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/match-new-task-screenshot-uploads-to-new
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-30T15:27:25Z"
---
## Problem

On the **New task** side panel, the area where users add and preview uploaded screenshots uses a different layout and styling than the **New input** panel. Both flows support the same kind of attachment (pick, drop, preview, remove), but the visual treatment diverges. That inconsistency makes the product feel uneven and forces users to relearn controls between two similar creation flows.

## Desired UX

When creating a new task (Freeform or Manual), the Screenshots field should look and behave like the Screenshots field on **New input**: same dropzone presentation (already largely shared), and the same pending-attachment list layout—thumbnail placement, filename treatment, expand control, and remove control—so the two panels are visually aligned.

## Acceptance criteria

- [ ] With one or more screenshots attached on **New task**, the pending list matches **New input** in layout (grid/list structure, spacing, thumbnail size, filename row, expand and remove affordances).
- [ ] With one or more screenshots attached on **New input**, appearance is unchanged (this task only brings New task up to that baseline).
- [ ] Empty state, “add more” dropzone copy, drag-over highlight, click-to-file-picker, and remove/expand interactions still work on **New task** after the change.
- [ ] Screenshots still upload correctly when the task is created (no regression in attach-on-create behavior).
- [ ] After UI changes, `bun run build:ui` (or full build) is run so the served UI reflects the update.
- [ ] Scoped check passes: `bun run fmt` and `repoos check --changed main` (or equivalent pre-review gate for this repo).

## Notes for AI

- **Reference implementation:** `src/ui-app/src/components/NewInputPanel.vue` — Screenshots field uses global classes `shot-dropzone`, `ff-pending-files`, `ff-pending-file`, `ff-pending-file-name`, `ff-pending-file-remove`, plus `ScreenshotExpandButton` for images.
- **Change target:** `src/ui-app/src/components/TaskDrawer.vue` — new-task creation block currently renders pending shots with `shot-grid` / `shot-thumb` / `shot-remove` / `shot-name` (see ~3312–3367). Refactor that markup (and any drawer-local scoped styles tied to it) to reuse the same global patterns as New input rather than duplicating a second thumb grid.
- **Shared styles:** Prefer extending `src/ui-app/src/style.css` if a small variant is needed; do not introduce bespoke colors/spacing in component `<style scoped>` blocks (see AGENTS.md drawer/form conventions).
- **Assumption:** Matching applies to **uploaded pending screenshots** on the new-task form, not to captured preview shots on the Changes tab or PM chat attachments—leave those unless they accidentally share the same new-task-only markup.
- **Format info control:** New task has an info button beside the Screenshots label (#0571); New input does not. Keep that control unless removing it is required for visual parity; the user asked specifically for uploaded-screenshot layout/styling parity.
- **Do not** change attachment storage APIs, `ui.pendingScreenshots` semantics, or New input behavior except shared CSS extracted for reuse.
- **Shots section:** If the diff is user-visible in the drawer, add or update a `## Shots` task declaration via `repoos update` when handing off (board convention)—compare both panels side by side.

## Scope

**In scope:** Visual and structural alignment of the New task pending screenshot list (and any New-task-only CSS) with New input.

**Out of scope:** Redesigning both panels, changing accepted file types, moving the Screenshots field order relative to other fields, or unifying unrelated screenshot UIs (task Changes grid, PM chat, bug report).

## Related

- Global form/attachment helpers: `src/ui-app/src/style.css` (`shot-dropzone`, `ff-pending-*`).
- Prior art: format hint beside New task label (#0571); shared dropzone copy aligns both panels already.

## Shots

The capture step DSL cannot attach files, so these open each creation panel on its Screenshots field (the changed markup is shared with New input and is also asserted by the screenshot-viewer wiring test). Attach one or more images in the panel to see the matched pending list.

```json
[
  {
    "target": "default",
    "route": "/work?task=new",
    "label": "New task — Screenshots field",
    "steps": [{ "waitMs": 400 }]
  },
  {
    "target": "default",
    "route": "/inputs",
    "label": "New input — Screenshots field",
    "steps": [{ "click": "button.new-btn" }, { "waitMs": 400 }]
  }
]
```

## Original prompt

Uploaded screenshots layout and styling not the same on "new task" panel as it is on "new input" panel. I prefer the style and layout on "new input", please update "new task" screenshots to match.

## Screenshots

![Screenshot-2026-09-30-at-20.56.57](/api/tasks/0608/attachments/screenshot-1.png)
![Screenshot-2026-09-30-at-20.53.22](/api/tasks/0608/attachments/screenshot-2.png)

## Activity

- 2026-09-30T15:27:25Z · created · hello@repoos.org
- 2026-09-30T15:27:26Z · screenshots
- 2026-09-30T15:27:26Z · screenshots
- 2026-09-30T15:27:48Z · status draft→inbox, title, area, type, body
- 2026-09-30T15:28:58Z · status inbox→ready
- 2026-09-30T17:25:17Z · model_override
- 2026-09-30T17:25:24Z · status ready→active, branch
- 2026-09-30T17:29:59Z · body
- 2026-09-30T17:34:20Z · status active→review
- 2026-09-30T17:35:03Z · note: shots: failed — capture of New input — Screenshots field on "default" failed: goto: Timeout 30000ms exceeded.


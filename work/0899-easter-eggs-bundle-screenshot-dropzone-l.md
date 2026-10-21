---
id: "0899"
title: "Easter eggs bundle: screenshot dropzone layout"
type: bug
status: inbox
hold: true
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-21T13:43:38Z"
updated_at: "2026-10-21T13:43:42Z"
---
## Items

- [ ] **E1 · Screenshot dropzone wraps to two lines** (web) — after #0877 made `ShotDropzone` a `<label>`, the global `.field label` rule leaks into it. Source: user report 2026-10-21.

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body.

## E1 · Screenshot dropzone wraps to two lines

### Problem
Since #0877 the screenshot dropzone (`src/ui-app/src/components/ShotDropzone.vue`) renders as a `<label class="shot-dropzone">`. Inside a `.field` wrapper (New input, New task, and the TaskDrawer screenshots section) the global `.field label` rule in `src/ui-app/src/style.css` (specificity 0,1,1) beats `.shot-dropzone` (0,1,0). It forces `display: block`, 10px uppercase monospace, letter-spacing and `margin-bottom: 6px` onto the dropzone. The result: the icon and the text stack on two lines instead of sitting side by side on one, and the text is uppercase mono. See the attached screenshots (New input and New task panes). The PWA picker itself now works; only the layout regressed.

### Desired UX
- The dropzone looks as it did before #0877: icon and text on one row (`display: flex`, centered, 9px gap), 12.5px normal-case body font, no extra bottom margin.
- Same everywhere the dropzone appears: New input, New task (Freeform and Manual tabs), TaskDrawer screenshots section, and any other `.shot-dropzone` use (check `SettingsImportExport.vue` and grep for `shot-dropzone`).

### Acceptance criteria
- Fix by raising the dropzone's specificity or resetting the leaked properties (e.g. `.field .shot-dropzone`), not by changing the host panels. The `.field label` rule stays unchanged for real labels.
- Test (style or component test): the dropzone's computed `display` is `flex` and `text-transform` is `none` when nested in `.field`.
- Verified in the browser at panel width and a narrow width: one row where the text fits, wrapping only the text, never the icon above it. Light and dark themes checked.
- All usages listed above checked, not just the two in the screenshots.

### Notes for AI
Start from the `.shot-dropzone` block in `src/ui-app/src/style.css` (~line 6970) and `.field label` (~line 5655). Declare a `## Shots` for New input and New task. Source: user report 2026-10-21 with two screenshots.

## Screenshots

![1](/api/tasks/0899/attachments/att_6573b9c6-4601-44c5-a381-0a2e1a8b6e8c.png)
![2](/api/tasks/0899/attachments/att_4a56fb0d-3858-4cd1-bc4c-be4ab34a6eb8.png)

## Activity

- 2026-10-21T13:43:38Z · created · njachowski@gmail.com
- 2026-10-21T13:43:42Z · screenshots

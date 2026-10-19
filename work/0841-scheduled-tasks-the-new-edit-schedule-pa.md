---
id: "0841"
title: "Scheduled tasks: the New/Edit schedule panel is unusable; rebuild it on the standard side-panel shell"
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-19T00:15:48Z"
updated_at: "2026-10-19T00:15:51Z"
---
## Problem
The scheduled-tasks feature (#0093) cannot be used because the **New schedule / Edit schedule** panel on the Agents page is unusable (see the attached screenshot): every single-line field (Schedule name, Timezone, Local time) renders as a giant textarea-sized box, the content is cramped against the screen edge with no panel header, close button or standard width, and the "Next run preview" shows **"Could not preview"** with the default Weekly / Asia/Singapore / 09:00 values. A user cannot reasonably create a schedule.

Root cause pointers (src/ui-app/src/components/ScheduledTasksPanel.vue, ~lines 272-345): the editor is a plain `<Dialog>` whose `<DialogContent class="schedule-editor">` has none of the drawer chrome the other panels use, and the single-line fields are `<input class="ff-textarea">` — `ff-textarea` is the multi-line textarea style, so inputs inherit its large min-height. The preview error text is set at ~line 114.

## Desired UX
The panel must look and behave exactly like our other side panels (New task, New story, New doc, New skill — see NewDocPanel.vue / NewStoryPanel.vue):
- Same **drawer** shell: `DialogContent` with the shared drawer classes, `drawer-resize` handle, a `drawer-head` with the title and the standard **X close button**, same width/size, same scrolling body and sticky footer buttons.
- **Click outside / Esc closes** it (shared dialog overlay and layer behaviour; the panel must carry the shared `data-overlay-layer` handling via the shared dialog components, not hand-rolled).
- Fields use the global form classes from `src/ui-app/src/style.css` (`field`, `ff-*`, `btn-row`): normal-height single-line inputs via the shared `Input` component, `ff-textarea` only for the multi-line task specification, the shared styled `Select` for Cadence / Day of week (never a native `<select>`), the shared date/time controls where they exist.
- Timezone: a sensible default (the browser's IANA zone) with validation and a clear inline error; the **next-run preview must work** for the default values and show the next occurrence (e.g. "Mon 19 Oct 09:00 Asia/Singapore, in 5h"), and show a specific reason when invalid, not a generic "Could not preview".
- Create, edit, enable/disable, run now and delete all work end to end from the UI, with the shared confirmation dialog for delete (no native `confirm()`).
- Light and dark themes, narrow widths, and keyboard focus order are correct.

## Acceptance criteria
- Test: the schedule panel renders inside the shared drawer shell (drawer head, X close, resize handle) and closes on X, Esc and outside click.
- Test: single-line fields render with the standard input height (no `ff-textarea` on `<input>`), cadence/day use the styled Select.
- Test: with default values the next-run preview returns a real date/time; an invalid timezone or time shows a specific message; the Save button is disabled until the form is valid.
- Test: create -> edit -> disable -> run now -> delete flow against the API works from the component.
- Declared shots (use a real task id and an existing fixture or add a `schedule:newPanel` fixture): the New schedule panel in light and dark, with the highlight on the panel; compare it visually to the New task panel and confirm size/styling match. Open every PNG; a missing target now fails the handoff.
- Follows AGENTS.md conventions: shared dialog components, body-teleported layers, global form classes in style.css (extend style.css if a variant is missing), no bespoke colors in a scoped style block.

## Notes for AI
Start from NewDocPanel.vue and NewStoryPanel.vue as the model; reuse their structure and the `drawer*` classes rather than writing new CSS. Do not change the scheduler's backend behaviour (#0093: opt-in, off in previews/worktrees/tests). Never touch repoos.toml. Source: Nick, 2026-10-19, screenshot of the broken panel.

## Screenshots

![New schedule panel: huge inputs, no panel chrome, 'Could not preview'](/api/tasks/0841/attachments/att_6e263238-7eca-4025-b215-2529a5bd7c65.webp)

## Activity

- 2026-10-19T00:15:48Z · created · njachowski@gmail.com
- 2026-10-19T00:15:51Z · screenshots

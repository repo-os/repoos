---
id: 1048
title: "Human task Mark done: modal with multi-line completion report"
type: feature
status: inbox
human_step_decision: agent
human_step_decision_key: 26944cd9
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-07T00:56:19Z"
updated_at: "2026-11-07T00:56:21Z"
---
## Problem

On a human-assigned task the drawer's "Mark done" strip has a single-line
`<Input>` for the optional completion note (`humanCompletionNote` in
`src/ui-app/src/components/TaskDrawer.vue`, the `drawer-human-task` notice).
A real human report (what was tested, on what device, what was observed, what
was *not* verified) does not fit on one line; the text scrolls sideways and is
unreadable. Found while closing out a verification task from the divot repo
(a lid-close keep-awake test with a multi-paragraph result), but any
needs-human-step task has the same need.

## Change

- Replace the inline note input with a confirm **modal** opened by "Mark done"
on human tasks (not for status moves via the dropdown unless that path also
goes through `setStatus('done')` for human tasks; keep both consistent).
- Modal contents: title ("Mark done"), short description, an optional
**5-6 line `<textarea>`** (labelled "Completion report (optional)", keeps
newlines), and Cancel / Mark done buttons. Empty report still allowed.
- The report is stored exactly as the single-line note is today (same API
field), but must preserve multi-line text end to end: check the task-file
writer/parser round-trips newlines and markdown without breaking
frontmatter or the body, and that it renders readably in the drawer.
- Use the shared dialog components in
`src/ui-app/src/components/ui/dialog/` and the global `ff-*`/`field`/
`btn-row` classes in `style.css`; no bespoke scoped modal styling. No native
`confirm()`/`prompt()`.

## Modal quality bar (recurring problem: do not skip)

- Correct padding on all sides of the content and the footer; buttons are not
flush against the edges or each other.
- Both buttons have full-size, reliably clickable hit areas (nothing overlaps
or sits under another layer); Cancel, Mark done, the close X and Escape all work, and
clicking the scrim cancels without submitting.
- Rendered via the dialog `Teleport`/`DialogPortal` with `data-overlay-layer`
so it is not click-transparent or trapped in the drawer's stacking context.
- Keyboard: focus lands in the textarea, Tab order reaches both buttons,
Cmd/Ctrl+Enter submits. Works at narrow/touch widths.
- Add a UI/component test that clicks both buttons (real click, not a direct
handler call) and a declared `## Shots` of the open modal.

## Done when

A human task can be marked done through a modal with a multi-line report that
persists and displays intact, and the modal passes the checks above.

## Activity

- 2026-11-07T00:56:19Z · created · njachowski@gmail.com

---
id: "0061"
title: Keep freeform new-task text when the drawer closes
type: bug
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/keep-freeform-new-task-text-when-the-dra
created_at: "2026-08-10T23:25:31Z"
updated_at: "2026-08-10T23:55:19Z"
---
## Problem

The freeform "Describe the task" textarea in the New task drawer is wiped
every time the drawer closes and reopens. The text is cleared by the
`watch(() => ui.isNew, ...)` in `src/ui-app/src/components/TaskDrawer.vue`
(`freeformText.value = ""`) whenever the drawer is reopened. A common flow is
to start typing a freeform task, realize another task needs to be checked,
click out (closing the drawer), then come back to New task — only to find the
draft is gone and has to be retyped from scratch.

## Desired UX

Text typed into the freeform textarea survives closing and reopening the New
task drawer:

- Closing the drawer — via its close affordance, clicking outside, or
  navigating away — and later reopening it returns to the freeform flow with
  the text exactly as the user left it, so they can pick up where they stopped.
- The text is also preserved when switching between the freeform and manual
  modes inside the drawer and back.
- The text is cleared only when a task is actually created successfully (the
  existing post-create clear), or via an explicit clear affordance.
- On a failed PM-agent call, the existing behavior already keeps the text; that
  must not regress.

## Acceptance criteria

- [ ] Typing in the freeform textarea, closing the New task drawer, and
      reopening it shows the previously typed text intact
- [ ] Text survives both close paths: the drawer's close button and clicking
      outside the drawer
- [ ] Switching freeform → manual → freeform within the drawer does not clear
      the typed text
- [ ] Text still clears after a successful task creation, and stays put on a
      failed/fallback PM-agent call (existing behavior, no regression)
- [ ] `repoos check` passes

## Notes for AI

- **Root cause**: `TaskDrawer.vue` clears `freeformText` in the
  `watch(() => ui.isNew, ...)` callback (around `src/ui-app/src/components/TaskDrawer.vue:69-78`,
  line ~74). Remove that reset.
- **Component is always mounted**: `App.vue` renders `<TaskDrawer />`
  unconditionally and the drawer shows/hides via an `open` computed, so local
  component refs (`freeformText`) already persist across close/reopen — no
  store change is required. Do not lift the state into the `ui` store unless
  this turns out not to hold.
- Keep the post-create reset (`freeformText.value = ""` after a successful
  create) and the failure-path behavior that preserves the explanation.
- `freeformText` is only reset on drawer open today; there is no per-mode
  clearing, so mode switches already preserve text — just don't add one.
- **Assumption**: draft persistence is session-only (in-memory). Persisting
  the draft across a full page reload is out of scope unless the user asks.
- After any change under `src/ui-app`, rebuild (`bun run build`) and verify via
  the headless UI smoke test in `repoos check`.

## Scope

- **This task**: preserve the freeform textarea draft across drawer close/open
  within a session.
- **Defer to a SEPARATE task**: persisting drafts across page reloads (e.g. to
  localStorage), an explicit Clear button, and preserving drafts for the
  manual new-task form.

## Related

- 0036 introduced the freeform flow this bug lives in.

## Activity

- 2026-08-10T23:25:31Z · created · unknown
- 2026-08-10T23:26:24Z · status inbox→ready
- 2026-08-10T23:47:06Z · status ready→active
- 2026-08-10T23:52:50Z · status active→review
- 2026-08-10T23:55:19Z · status review→done

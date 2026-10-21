---
id: "0877"
title: "PWA: clicking the screenshot upload area does not open the file picker"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T13:54:39Z"
updated_at: "2026-10-21T00:56:53Z"
---
## Problem
In the installed PWA, every screenshot-upload area (for example "Click to add screenshots, or drop them anywhere on this panel" in the New task panel, Freeform tab) ignores a click: the file picker never opens. Dropping a file on the area works. The same click opens the picker correctly in the native macOS app (RepoOS Hub) and in the website in Chrome and Safari, so the bug is specific to the PWA (standalone display mode).

Secondary, lower priority: in Chrome the native file picker does not follow the light/dark system theme, while RepoOS Hub and Safari show a dark picker. That is browser behaviour, so only fix it if a `color-scheme` setting on the input or its container is enough.

## Desired UX
Clicking (or keyboard-activating) any screenshot upload area in the PWA opens the system file picker, exactly as in the browser and RepoOS Hub. Dropping files keeps working. Multiple image files can be selected.

## Acceptance criteria
- Every screenshot/attachment upload control (New task, task drawer screenshots, New input, New story, and any other `shot-dropzone` or file-input use) opens the file picker on click in the PWA.
- The cause is found and the fix applies to the whole class (every place that triggers a hidden file input), not just the New task panel. List every call site audited.
- Keyboard activation (Enter and Space) also opens the picker.
- Drop behaviour is unchanged.
- A test covers the click-to-picker wiring for the shared dropzone component.
- The Chrome dark-mode picker note is either fixed with `color-scheme` or recorded in the task as a browser limitation.

## Notes for AI
- Likely suspects: a hidden `<input type="file">` triggered with `input.click()` from a handler that is not a direct user gesture, a `label`/`for` or `pointer-events` problem, a `display:none` input, or an overlay (drop layer, `data-overlay-layer`) swallowing the click in standalone mode. Check the PWA manifest `display` mode and any service-worker or `launch_handler` behaviour; reproduce in the browser pane with display-mode emulation if possible.
- Reproduce first, then fix. Component styles live in `src/ui-app/src/style.css` (`shot-dropzone`).
- The reporter's screenshot (the New task panel with the dashed "Click to add screenshots" area) could not be attached automatically; ask the human for the file if a visual is needed.

## Activity

- 2026-10-20T13:54:39Z · created · njachowski@gmail.com
- 2026-10-21T00:56:53Z · status inbox→ready

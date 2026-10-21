---
id: "0877"
title: "PWA: clicking the screenshot upload area does not open the file picker"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
debug_tldr: "The engineer agent process crashed before handoff — open the task’s full session log for the stack trace, then restart the run from the board."
debug_tldr_at: "2026-10-21T01:05:44Z"
debug_tldr_key: dev-error|the agent process exited with an error — open the task to see the full output
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/pwa-clicking-the-screenshot-upload-area-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T13:54:39Z"
updated_at: "2026-10-21T01:25:58Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T01:05:24.436Z\",\"kind\":\"dev-error\"}]"
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

## Fix notes
Cause: the three failing controls opened their hidden file input with a synthetic
`input.click()` from a pointer handler. An installed PWA can ignore that
activation; the upload controls that already worked (Settings import/export, the
bug-report screenshots) are plain `<label>`s. Every screenshot picker now uses
native activation instead: the input covers the dropzone (a real click lands on
it) inside a label, with label activation as the fallback.

Audited call sites (2026-10-21):

| Control | File | Wiring |
| --- | --- | --- |
| New task dropzone | `src/ui-app/src/components/TaskDrawer.vue` | shared `ShotDropzone.vue` (fixed) |
| New input dropzone | `src/ui-app/src/components/NewInputPanel.vue` | shared `ShotDropzone.vue` (fixed) |
| PM chat attach (task and story panels) | `src/ui-app/src/components/PmChatSurface.vue` | label-wrapped input (fixed) |
| Settings import/export | `src/ui-app/src/components/SettingsImportExport.vue` | already label-wrapped (unchanged) |
| Settings bug-report screenshots | `src/ui-app/src/views/SettingsView.vue` | already `label for=` (unchanged) |
| New story | `src/ui-app/src/components/NewStoryPanel.vue` | no file input of its own; its PM chat uses `PmChatSurface` |
| New doc / New skill upload | `NewDocPanel.vue`, `NewSkillPanel.vue` | visible `<input type=file>`, no hidden trigger (unchanged) |

Keyboard: Enter and Space on the dropzone/attach control open the picker.
Drop behaviour is unchanged — the host panels still own drag and drop.

Browser limitation: Chrome’s native file picker follows the OS/browser
appearance, not page CSS, so the light/dark mismatch reported for Chrome is not
fixable with `color-scheme` on the input or its container. Recorded here as a
browser limitation.

Verification: `shot-dropzone.test.ts` (component wiring plus the call-site
audit) and `shot-input-visibility.test.ts`. The installed PWA itself cannot be
launched from this runner; the evidence here is the jsdom wiring test and the
repo’s already-working label-based upload controls.

## Activity

- 2026-10-20T13:54:39Z · created · njachowski@gmail.com
- 2026-10-21T00:56:53Z · status inbox→ready
- 2026-10-21T00:56:59Z · cli_override, model_override
- 2026-10-21T00:57:00Z · status ready→active, branch
- 2026-10-21T01:04:42Z · message_queued at 2026-10-21T01:04:42.900Z
- 2026-10-21T01:04:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T01:05:24Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T01:05:24Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T01:05:27Z · message_delivered: 1 message(s)
- 2026-10-21T01:20:12Z · body
- 2026-10-21T01:20:15Z · body
- 2026-10-21T01:23:02Z · body
- 2026-10-21T01:25:05Z · body
- 2026-10-21T01:25:58Z · body: Fix notes (added)
- 2026-10-21T01:25:58Z · message_delivered: 1 message(s)

# QA: task creation and editing — November 2026

## Environment

- Server: `just serve-noauth 7272` from a detached scratch worktree at the task branch, binding only to `127.0.0.1`.
- Browser: Playwright Chromium, headless only. No visible browser or user Chrome was opened.
- Viewports: 1280 × 900 and 375 × 900.
- The preview server is read-only by design. Playwright let its GET requests reach the server and intercepted only the successful create, screenshot-upload, and task-update requests. This exercised the UI request bodies and success states without changing the board.

## Results

| Flow / check | Result | Evidence |
| --- | --- | --- |
| Work queue load | Pass | `/work` loaded with the task queue; no page errors were observed. |
| New task panel | Pass | Freeform and Manual modes rendered at both viewports; document width matched the viewport (0 px horizontal overflow). |
| Empty freeform validation | Pass | Both Create task and Create draft were disabled with an empty description. |
| Manual create with dependency | Pass (UI request mocked) | Selected a task in the new searchable Depends on picker. The intercepted `POST /api/tasks` body included `dependsOn: ["1169"]`; the successful response closed the panel. |
| Screenshot attachment during create | Pass (UI request mocked) | Selected `qa.png`; the intercepted `POST /api/tasks/9001/attachments` request followed create and the panel closed after the mocked success response. |
| Edit task dependency | Pass (UI request mocked) | In task #1189 Details, selected prerequisite #1169 and saved. The intercepted `PATCH /api/tasks/1189` body included `dependsOn: ["1169"]`; the unsaved-changes panel cleared after success. |
| Dependency picker at 375 px | Pass | Picker stayed visible and the document had 0 px horizontal overflow in both New task and task Details screens. |
| Backend create and attachment behavior | Pass (tests) | `bun run test -- attachments task-created-by` passed; attachment tests write and resolve stored screenshot files, and route tests exercise task creation. |
| Backend dependency persistence and validation | Pass (tests) | `bun run test -- task-dependencies` passed; tests persist `depends_on` and reject unknown IDs, self-dependencies, and cycles. |

## Changes made

The UI previously showed existing prerequisites but did not let users set them. Added a searchable prerequisite picker to Manual task creation and the task Details editor. The picker excludes the task being edited, shows up to eight matches, supports selecting and removing multiple prerequisites, and sends IDs through the existing `dependsOn` create and PATCH fields. Selection is reset when a new task panel opens and after successful creation.

Added component and TaskDrawer tests for filtering, excluding the current task, selection/removal, and the dependency IDs sent by both create and edit requests.

## Verification

- Headless browser run on the actual auth-less preview server at 1280 and 375 px. Only mutating endpoints were intercepted because the preview router correctly rejects writes; this checked UI request payloads and successful response handling, not server persistence.
- `bun run test -- task-dependency-picker task-dependencies-ui new-task-area-default freeform-submit-ack attachment-upload-ux`: passed.
- `bun run test -- attachments task-created-by task-dependencies`: passed.
- `bun run build:ui`: passed.
- Final changed-path check: `REPOOS_CHECK_CHANGED=main repoos check`.

Temporary screenshots and the detached scratch worktree were used only for this pass and are not part of the deliverable.

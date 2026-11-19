# Task create and edit QA — November 2026

## Scope and method

The fixture driven interaction suite mounts the production `TaskDrawer` component and runs its create and edit flows at 375 px, 768 px, and 1280 px. It drives the rendered title, priority, area, depends on, screenshot file input, and save controls while repository writes are fixture mocked. A separate headless WebKit test renders the actual drawer DOM captured from `TaskDrawer`, injects the Vite compiled global stylesheet and the Vue compiled `TaskDrawer` scoped stylesheet, and measures the drawer and visible controls at each width. No visible browser was opened.

## Checked

- At all three widths, the manual create form requires a title before enabling Create, then saves the entered title, selected priority, selected area, and selected prerequisite through the repository store.
- The area and priority values are chosen through the rendered picker triggers and options. The prerequisite is selected and removed through the task dependency picker.
- The screenshot fixture is supplied through the rendered screenshot file input. The test waits for the file reader callback and verifies the queued image is sent to the created task ID.
- At all three widths, the edit form changes priority, area, and prerequisite through rendered controls and verifies the task patch.
- The WebKit geometry check uses the actual create and edit drawer markup and production styles. It measures drawer bounds, document/body overflow, and each visible control’s bounds against the viewport.
- Existing tests continue to cover dependency filtering and self exclusion, keyboard title edit save/cancel, priority/type validation, and screenshot dropzone behavior.

## Findings and changes

The initial responsive pass treated jsdom viewport properties as layout evidence and queued screenshots directly in the store. Those checks could prove component state transitions but not actual geometry or file input wiring. The updated interaction suite now uses the drawer’s visible area and priority pickers and sends its PNG fixture through the actual file input. The separate WebKit measurement is based on the production drawer component and compiled styles rather than a handcrafted form with copied picker CSS.

## Limits

The interaction suite uses mocked repository writes; it does not claim a live server or external upload service. WebKit validates the rendered drawer geometry and visible control bounds, while the component suite validates control interactions. No physical device or authenticated live service was used.

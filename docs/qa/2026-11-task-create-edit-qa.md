# Task create and edit QA — November 2026

## Scope and method

Headless WebKit is the required browser engine for this pass. A responsive browser fixture is run at 375 px (phone), 768 px (tablet) and 1280 px (desktop); it exercises empty-title validation, create readiness, edit entry, priority/area selection, dependency selection, screenshot file selection and control reachability. Component behavior is separately covered by `task-drawer-title-edit.test.ts`, `task-dependency-picker.test.ts`, and `task-priority-type-validation.test.ts`.

## Checked

- At each target width, the browser fixture verifies the title gate and validation state, enters edit mode, selects priority and area, selects a prerequisite, selects a PNG fixture, and confirms each visible control remains within the viewport.
- The dependency picker browser check confirms long candidate titles remain clipped within the picker at all three widths.
- Component tests verify dependency candidate filtering, exclusion of the current task, selection/removal events, title edit focus/Enter save/Escape cancel, and priority/type validation.
- Screenshot controls accept click/drop input, expose accepted formats through a keyboard-focusable help control, list pending screenshots and allow removal/retry states through the shared screenshot components.

## Findings and changes

No drawer layout or interaction defect was reproduced. The browser fixture now uses the requested three-width matrix for the complete sequence of create/edit and field interactions, with viewport containment checked after the screenshot fixture is attached. Component tests provide coverage of the application component event and save behavior; the browser fixture checks responsive browser interaction and reachability.

## Limits

This pass used a browser fixture, component tests and headless WebKit. It did not use a real device, real uploaded user image, or authenticated live server. A successful scoped RepoOS check is the final validation for this branch.

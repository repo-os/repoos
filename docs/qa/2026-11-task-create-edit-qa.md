# Task create and edit QA — November 2026

## Scope and method

Headless WebKit is the required browser engine for this pass. The responsive dependency picker browser test is run at 375 px (phone), 768 px (tablet) and 1280 px (desktop). The drawer’s manual creation and details editing paths are covered by the component tests in `task-drawer-title-edit.test.ts`, `task-dependency-picker.test.ts`, and `task-priority-type-validation.test.ts`; screenshot selection/upload states are implemented through the shared screenshot components and their related tests.

## Checked

- Manual task creation exposes title, optional body, type, priority, area, assignee, depends-on picker and screenshot dropzone.
- The create button stays disabled while the title is empty and becomes available when a title is entered.
- Task details editing exposes depends-on, type, priority and area controls; the dependency picker excludes the task being edited.
- Dependency picker candidate selection and removal emit the expected prerequisite IDs. Long candidate titles remain clipped within the picker at all three target widths.
- Screenshot controls accept click/drop input, expose accepted formats through a keyboard-focusable help control, list pending screenshots and allow removal/retry states.
- Existing task title edit coverage checks entering edit mode, keyboard focus, Enter save and Escape cancel.

## Findings and changes

No drawer layout or interaction defect was reproduced in the checked code paths. The existing responsive browser coverage skipped the requested tablet width, so its viewport matrix now includes 768 px alongside phone and desktop. This guards the dependency picker against horizontal overflow at the intermediate breakpoint.

## Limits

This pass used repository fixtures/component tests and a headless browser. It did not use a real device, real uploaded user image, or authenticated live server. A successful scoped RepoOS check is the final validation for this branch.

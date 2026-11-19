# Task create and edit QA — November 2026

## Scope and method

The fixture-driven task drawer interaction suite runs at 375 px (phone), 768 px (tablet) and 1280 px (desktop). It mounts the real `TaskDrawer` component with Vue test utilities, sets each viewport width, stubs repository writes, and drives the manual create and details edit flows. A separate headless WebKit browser test checks dependency-picker overflow at each same width. No visible browser was opened.

## Checked

- At each width, manual task creation starts with an empty title and a disabled Create action; entering a title enables it.
- The create fixture renders title, optional body, type, priority, area, assignee, depends-on and screenshot controls. The form saves the selected title, priority, area and prerequisite fixture through the repository store.
- The create fixture queues a pending PNG screenshot and verifies it is uploaded to the created task ID.
- At each width, the details fixture saves priority, area and prerequisite changes for the open task.
- At each width, the dependency-picker fixture selects and removes a prerequisite using the picker's visible option and remove buttons.
- The headless WebKit overflow fixture checks long dependency titles stay inside the picker at all three widths.
- Existing tests cover dependency filtering/self-exclusion, title edit keyboard save/cancel, priority/type validation, and screenshot dropzone file input behavior.

## Findings and changes

The earlier pass only added tablet coverage to the static picker overflow check. Review correctly identified that this did not cover create/edit flows. Added `task-create-edit-responsive.test.ts` with fixture-backed create, edit, field update, prerequisite selection/removal and screenshot upload assertions across all three target widths. The test uses component interactions and a mocked repository; it does not claim a live server or actual file upload.

## Limits

The create/edit interaction matrix is component-level with the viewport width set in the DOM test environment. The WebKit browser test measures actual rendered picker overflow, not the entire drawer layout. Screenshot upload is verified through the queued fixture and mocked store method. No physical device, authenticated live server or external upload service was used.

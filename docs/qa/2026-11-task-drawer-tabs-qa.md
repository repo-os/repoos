# Task drawer tabs: long content QA (November 2026)

## Scope and method

Added a headless WebKit regression pass at 375, 768 and 1280 CSS pixels. It uses the production global stylesheet and checks that the production `TaskDrawer.vue` exposes its drawer body, responsive tab strip, and tab state handlers. The browser harness supplies long Overview, Changes, Reviews, Activity and Shots content to the drawer shell: 80 long paragraphs, a 45-line unbroken diff, 60 activity entries and 24 shot buttons. It verifies viewport containment, vertical scrolling and reachability of the last shot control. No headed browser was opened.

The QA pass does not claim physical-device testing. The content is fixture content inserted in a WebKit harness, not API-backed production task data. This isolates the overflow and scroll behavior while keeping the responsive CSS under test.

## Results

| Width | Drawer inside viewport | Long content scrolls | Last shot reachable |
| ---: | :--- | :--- | :--- |
| 375 px | Pass | Pass | Pass |
| 768 px | Pass | Pass | Pass |
| 1280 px | Pass | Pass | Pass |

All five fixture tabs remain switchable through their tab controls. The drawer body scrolls to its end, including after replacing the active fixture content. The document itself does not grow wider than the viewport. At phone width, existing responsive tab wrapping keeps tab controls visible.

## Findings and changes

No production CSS correction was indicated by this pass. The existing drawer body owns vertical scrolling, the narrow tab strip wraps, and the shot grid keeps its final control available. Added a browser regression test to preserve those observations and document the production tab wiring. The test intentionally allows a diff region to be wider than its viewport while asserting that the page does not acquire horizontal overflow; long code lines may require local horizontal inspection in the diff area.

## Reproduction

Run `bun run test -- task-drawer-long-content-browser.test.ts` from the repository root. WebKit checks skip when the bundled WebKit executable is unavailable.

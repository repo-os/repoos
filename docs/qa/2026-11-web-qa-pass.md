# Web app QA pass — November 2026

## Scope and method

The QA pass ran against this task worktree using `just serve-noauth` on port 7272 and Playwright. It did not use Nick’s desktop or the served checkout. Each listed route was captured at 1440, 390 and 320 CSS pixels in light and dark themes. Viewport screenshots were inspected in contact sheets. Screenshots and machine-readable results are kept outside Git in `.repoos/qa/1157/`.

Run from the worktree to reproduce the server setup and browser passes:

```sh
just serve-noauth 7272
bun .repoos/qa/1157/pass.mjs
bun .repoos/qa/1157/bottom-pass.mjs
```

The main matrix is catalogued in `.repoos/qa/1157/results.json`; bottom scroll results are in `.repoos/qa/1157/bottom-results.json`. `bottom-pass.mjs` visits each route at 390px light theme, waits for delayed content, scrolls overflow containers and the page repeatedly, records scroll positions, and saves the bottom screenshot. The matrix result and PNG filenames encode route, viewport and theme. The prior manual interaction scripts and extra state captures are in the same directory.

## Page, width and theme matrix

All routes below were captured at **1440 / 390 / 320**, in **light and dark** themes. “Settings Themes” is the Themes section of General Settings.

| Page / state | Desktop | Phone | Screenshots inspected |
| --- | ---: | ---: | --- |
| Control | 1440 | 390, 320 | Yes, light and dark |
| Inputs | 1440 | 390, 320 | Yes, light and dark |
| Work board | 1440 | 390, 320 | Yes, light and dark |
| Work Pipeline | 1440 | 390, 320 route states | Yes, light and dark; phone renders mobile queue |
| Task drawer, Changes tab | 1440 | 390, 320 | Yes, light and dark |
| Stories | 1440 | 390, 320 | Yes, light and dark |
| Checks | 1440 | 390, 320 | Yes, light and dark |
| Releases | 1440 | 390, 320 | Yes, light and dark |
| Deployments | 1440 | 390, 320 | Yes, light and dark |
| Dev | 1440 | 390, 320 | Yes, light and dark |
| Secrets | 1440 | 390, 320 | Yes, light and dark |
| Agents | 1440 | 390, 320 | Yes, light and dark |
| Context: Docs, Skills, Discover, History | 1440 | 390, 320 | Yes, light and dark |
| Settings: General, Notifications, Security, Advanced, Import/Export, Support, TOML, Themes | 1440 | 390, 320 | Yes, light and dark |
| Releases cut panel (`release:cutReady` fixture) | 1440 | 390, 320 | Yes, light and dark |

The task drawer was opened and closed; Task, PM, Dev, Review, Changes, Tokens and Debug tabs were selected. New task, input and story surfaces were opened and dismissed without submitting. The Releases cut panel was inspected using the safe ready fixture, including its narrow bottom state; no release was published. The full Check page was captured, but its tab switching is recorded below as incomplete.

## Findings and disposition

| Finding | Evidence / impact | Disposition |
| --- | --- | --- |
| Work mobile scroll and bottom dock clearance | At 390px, `.main` contains the `.mobile-work` scrollport. Its `scrollTop` reached 3686 of 3686px after content settled (`remaining: 0`). The bottom screenshot shows the last card above the fixed tab dock with clear space. The floating heads control was outside the card area at the scroll endpoint. No overlap was observed. The phone layout is the mobile queue; Pipeline is a desktop view. | Verified; no fix needed. `work-main-bottom-390-light.png`, `bottom-work-board-390-light.png`, `bottom-results.json`. |
| Checks tab interaction pass stalled | The dedicated repeated tab-and-screenshot browser run slowed and was stopped before all four tabs could be verified. This does not establish a UI defect, but leaves tab interaction behavior unverified. | Follow-up task #1163 filed with a Checks screenshot to reproduce the tab pass and distinguish an app stall from a harness stall. |
| Secrets environment list returned HTTP 401 | In the no-auth session, `GET /api/project-environments` returned 401 and Secrets displayed its failure state. The endpoint requires a signed-in user, so authenticated behavior was not observed. | Follow-up task #1164 filed with the captured Secrets state to verify the authenticated flow and improve/confirm the unauthenticated UX. No access control was bypassed. |
| Agents showed missing Cursor authentication | Agents displayed a configured Cursor CLI authentication error in this local environment. No valid test credential was available, so this is not evidence that the authenticated flow is broken. | Follow-up task #1165 filed with the Agents screenshot to verify setup/error guidance using an appropriately configured test environment. |
| Responsive layout, clipping and page width | Reviewed page captures showed no horizontal document overflow, clipping, or overlapping controls at the tested viewports. Repeated bottom scrolling reached the end of the scrollable page regions at 390px. | No clear UI defect found; no source fix or regression test was warranted in this pass. |

The corrected Playwright matrix recorded no application page exceptions. Its only console error was the Secrets 401 described above. The earlier harness attempt that set the theme before `document` existed was discarded and is not an app finding. The release cut button is disabled in the feature branch due to release preconditions; the panel itself was inspected via the preview fixture.

## Check

The implementation worktree passed `REPOOS_CHECK_CHANGED=main repoos check`, including remote build/test validation and the local UI smoke test. No application source files were changed in this QA pass.

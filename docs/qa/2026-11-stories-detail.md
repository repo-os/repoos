# Stories page and detail QA — November 2026

## Scope

QA pass for the Stories list, responsive layout, story detail panel, linked tasks, sort order, and completed-story filter. The live pass used the auth-less preview server from an isolated scratch worktree and headless Playwright WebKit. Viewports were 1280×900 and 375×812.

## Results

| Area | Result | Evidence |
| --- | --- | --- |
| Stories list | Pass | Live repository data rendered 12 story cards with excerpts, status chips, progress, and live task rows. |
| Desktop layout | Pass | At 1280px, document width matched viewport width (1280px). |
| Mobile list | Pass | At 375px, document width matched viewport width (375px); header controls wrapped and story cards remained usable. |
| Story detail | Pass | Selecting the first story opened its detail drawer with story name, number, path, and summary. Story, PM, Tasks, and Details tabs were present and selectable. |
| Mobile detail | Pass | At 375px, the drawer measured 375px and its content width was 374px; document width remained 375px. The Tasks tab showed linked tasks without horizontal overflow. |
| Linked tasks | Pass | The detail panel listed linked tasks with task numbers and statuses. The list's live-task affordance opened the task drawer. Escape closed the active drawer. |
| Completed filter | Pass | The Hide Completed Stories checkbox changed from unchecked to checked. Existing component tests cover hiding completed stories, restoring the list, and the completed-only empty state. |
| Sort | Pass | The sort menu exposed Most recently updated, Task number newest, and Task number oldest. Selecting Task number oldest updated the displayed order and selected label. |
| Empty/disabled states | Covered | Existing StoriesView tests assert the disabled notice, no-stories state, and completed-only empty state. These require alternate store fixtures, so they were verified in component tests rather than the live repository-backed session. |
| Browser errors | Pass | No page errors were observed during the responsive/detail interactions. |

## Findings

No reproducible UI defect was found, so this pass required no product-code change. Live data allowed direct coverage of the populated list, details tabs, task links, sort menu, and filter. The repo's StoriesView component suite supplies the controlled empty and disabled fixtures. The first browser navigation attempt used `networkidle` and timed out because the application maintains live polling; subsequent runs used `domcontentloaded` and waited for the relevant rendered selectors.

## Verification notes

`bun run test:vitest -- src/ui-app/tests/stories-view.test.ts src/ui-app/tests/story-panel.test.ts` passed: 2 test files and 61 tests. The required `REPOOS_CHECK_CHANGED=main repoos check` also passed; because this was a docs-only diff, its build, broad test, and UI-smoke stages were skipped by the configured changed-path policy. The headless Playwright run supplied the browser coverage described above.

The screenshots captured during the pass are scratch artifacts under `.repoos/` and are not part of this QA record. Browser checks were headless only; no visible browser or user Chrome profile was used.

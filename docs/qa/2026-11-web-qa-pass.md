# Web app QA pass — November 2026

## Scope and method

The QA pass ran against this task worktree using `just serve-noauth` on port 7272 and Playwright. It did not use Nick’s desktop or the served checkout. Each listed route was captured at 1440, 390 and 320 CSS pixels in light and dark themes. The original matrix applied theme values after mount; rounds 2 and 3 changed themes with the app’s own toggle. Round 3 refreshed Work, Inputs and the task drawer at 390px, plus Secrets at 320px, after the latest fixes. Fixed-state screenshots are attached to task #1157 and remain available after the worktree closes. The text matrix and findings below are the retained record; the transient capture directory is not required to read it.

From the worktree, start the app in one terminal and run the regression test in another:

```sh
just serve-noauth 7272
```

```sh
bun run test -- src/ui-app/tests/mobile-responsive-overflow.test.ts
```

For the visual pass, visit each route in the table below at 1440, 390 and 320px and switch light/dark themes with the visible theme control. Open the task drawer from Work, use the drawer’s tab strip to select each tab, then scroll each page to its end. The screenshot attachments on task #1157 provide durable examples of the repaired 320px states. The transient browser logs and full screenshot set were generated under the ignored `.repoos/qa/1157/` directory and are not referenced as durable evidence.

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

The task drawer was opened and closed. In the first pass, broad text matching selected the lifecycle “Review” action instead of its tab, so captures for Changes/Tokens/Debug from that attempt are invalid and are not evidence. In round 2, each tab was selected from `.drawer-tabs` by exact name and the active tab was checked before capture. Task, PM, Dev, Review, Changes, Tokens and Debug were all verified at 320px in both themes. New task, input and story surfaces were opened and dismissed without submitting. The Releases cut panel was inspected using the safe ready fixture, including its narrow bottom state; no release was published. The full Check page was captured, but its tab switching is recorded below as incomplete.

## Findings and disposition

| Finding | Evidence / impact | Disposition |
| --- | --- | --- |
| Work mobile filter row at 320px and 390px | The status select and sort/reset controls shared too little width: the sort button painted over or line-clamped “Needs attention.” | Fixed: at ≤420px, the status filter spans the row above sort/reset; the sort button and select may shrink safely. WebKit computed-layout assertions cover both widths; refreshed light/dark screenshots attached to #1157. |
| Task drawer quickbar status at 320px | The status select was compressed beside lifecycle controls until its value read only “Ac”. | Fixed: the status select takes its own row at phone widths. Regression assertion in `mobile-responsive-overflow.test.ts`; corrected drawer screenshots attached to #1157. |
| Inputs author byline at 320px | The input metadata flex row did not wrap, clipping the author email as “by hello@re”. | Fixed: metadata wraps and the byline permits breaks inside long identifiers. Regression assertions in `mobile-responsive-overflow.test.ts`; corrected Inputs screenshot attached to #1157. |
| Agents error card at 320px | The error notice included a long, unbroken `CURSOR_API_KEY/CURSOR_AUTH_TOKEN` token and clipped at the card edge. | Fixed: the notice text now wraps anywhere. Regression assertion in `mobile-responsive-overflow.test.ts`; corrected Agents screenshot attached to #1157. |
| Drawer Review tab toolbar at 320px and 390px | `.review-toolbar` was a non-wrapping flex row, so its third control (“Send engineer”) was cut off at the right edge. | Fixed: the row wraps at phone widths (`flex-wrap: wrap`). Caught in review; the first QA pass had reported the Review tab as clean. |
| Drawer Debug tab pills at 320px and 390px | `.debug-tabs` was a non-wrapping strip, so the fourth pill (“Merge conflict”) was cut off with no scroll affordance. | Fixed: the strip wraps (`flex-wrap: wrap`). Caught in review; the first QA pass had reported the Debug tab as clean. |
| Checks tab interaction pass stalled | The dedicated repeated tab-and-screenshot browser run slowed and was stopped before all four tabs could be verified. This does not establish a UI defect, but leaves tab interaction behavior unverified. | Follow-up task #1163 filed with a Checks screenshot to reproduce the tab pass and distinguish an app stall from a harness stall. |
| Secrets environment list returned HTTP 401 | In the no-auth session, `GET /api/project-environments` returned 401 and Secrets displayed its failure state. The endpoint requires a signed-in user, so authenticated behavior was not observed. | Handoff UI verification now captures `/secrets` with the registered `secrets:populated` fixture, which supplies local fake data and avoids the protected request. The original interactive no-auth QA finding remains tracked by #1164; authenticated behavior was not observed and no access control was bypassed. |
| Secrets environment selector at 320px | The environment label and fixed-width picker shared a row that could extend beyond the viewport; the document itself did not scroll, leaving the right edge and chevron unreachable. | Fixed: the narrow control row can wrap, stretches within the available width and allows the picker to shrink. A WebKit geometry assertion verifies the right edge stays inside the viewport; refreshed light/dark screenshots attached to #1157. |
| Agents showed missing Cursor authentication | Agents displayed a configured Cursor CLI authentication error in this local environment. No valid test credential was available, so this is not evidence that the authenticated flow is broken. | Follow-up task #1165 filed with the Agents screenshot to verify setup/error guidance using an appropriately configured test environment. |
| Page bottom and fixed controls | After content settled, every scrollable region across the listed page routes reached its end at 320 and 1440px in light and dark themes. In Work at 320px, the final mobile card ended at y=648 while the fixed dock began at y=836. At 1440px, every board column reached its bottom and the cards remained above the bottom pipeline control. | Verified in round 2. The corresponding page-bottom screenshots were inspected in contact sheets; no additional overlap or inaccessible bottom content was found. |

The corrected Playwright matrix recorded no application page exceptions (the review of this pass found two drawer rows that still clipped at phone widths; see the two Drawer findings above). Its only console error was the Secrets 401 described above. The earlier harness attempt that set the theme before `document` existed was discarded and is not an app finding. The release cut button is disabled in the feature branch due to release preconditions; the panel itself was inspected via the preview fixture. Rounds 2 and 3 used the visible theme toggle and confirmed the expected theme state. Round 3 geometry measurements recorded a 332px Work status trigger at 390px and a 220px Secrets picker at x=16/right=236 in a 320px viewport.

The remaining #1157 follow-ups are #1163 (Checks tab interaction pass not completed), #1164 (Secrets authenticated flow not observed), and #1165 (Agents Cursor authentication guidance with a valid test setup). These remain unverified rather than known product defects; their evidence and dispositions are tracked by their respective tasks.

## Check

Round 2's table-driven responsive test passed (7 tests), the UI build passed, and every round 2 page-bottom scroll measurement at 320/1440 had zero remaining distance. Round 3 added three real WebKit geometry checks for Work at 320/390 and Secrets at 320; all passed, along with the existing responsive checks. The UI build passed. The final scoped RepoOS check is recorded after validation.

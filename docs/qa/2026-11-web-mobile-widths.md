# Web app QA pass: mobile widths 375 and 768 — November 2026

Task #1170. This pass covers the 375 and 768 CSS-pixel widths on the main pages. The 390 and 320 widths were covered by #1157, and its fixes are not repeated here.

## Scope and method

The pass ran against this task worktree, with `just serve-noauth` on port 7272 and WebKit Playwright. It did not use the served checkout.

- Routes measured: Dashboard, Work, Releases, Settings, Agents, Checks, Stories, Inputs, Secrets, Dev, Context, Deployments.
- Widths: 375 and 768, in light and dark themes. That is 48 page loads.
- Per page, the script records document horizontal overflow and every visible element whose box extends past the viewport. Elements inside a horizontal scroller are excluded on purpose, because a scroller is a valid way to reach overflowing content.
- Screenshots were also taken and inspected for the pages and states listed below.
- Reproduce with `bun .repoos/qa/1170/measure.mjs` (set `QA_THEMES=light,dark` and `QA_SHOTS` to keep screenshots). Results are in `.repoos/qa/1170/measure-results.json`. The directory is gitignored, like #1157's `.repoos/qa/1157/`.

## Findings and disposition

| Finding | Evidence | Disposition |
| --- | --- | --- |
| Settings tab strip clipped the last tab at 761–815px | At 768px the seven-tab strip measured 656px wide, but its tabs need about 695px. The "repoos.toml" tab reached x=781 in a 768px viewport and was cut at the content edge. The overflow scroller rule ended at 760px, so the band between 761px and about 815px had no scroll. | Fixed: the scroller rule now covers widths up to 900px (`src/ui-app/src/style.css`). |
| Sidebar rail spilled its theme switcher and build widget at 720–900px | The 60px icon rail showed the starred-theme buttons ("Classic", "Clear", "Gen Z") and the build hash at negative x, so their labels were cut off at the rail edge. The rail rule hid `.theme-switch` and `.build-widget`, but later base rules with the same specificity set `display: flex` and won. | Fixed: the rail rule is scoped to `.sidebar`, so it wins (`src/ui-app/src/style.css`). |
| Work parked toggles overlapped the Active column and the integration pill at 720–900px | The fixed dock assumed the 210px sidebar. It was also sized as `100vw − 236px − 520px`, which left about 12px at 768px. "Human (11)" wrapped onto two lines, and the chips stacked over Active column cards, covering the "Restart work" button and the card's status label. | Fixed: at 720–900px the row starts at the rail edge, sits on one line, and lifts above the centred integration pill. The column bottom inset already clears it: at scroll end the last Active card ends about 50px above the row. |
| Floating avatars cover the theme star buttons on Settings › General at 768px | The floating heads default to visible at widths of 720px and above. On the theme list they sit over the rightmost star control of the Hypercolor row. | Not changed. The heads are a draggable overlay the user controls, and their default placement is a product decision. A human should decide whether tablet widths should start them hidden or at a corner. |

Regression tests: `src/ui-app/tests/tablet-rail-layout-browser.test.ts`, nine WebKit geometry cases at 720, 768 and 900px. Five of them fail on the original CSS: the rail hide (three widths) and the Work dock (two widths). The Settings strip case asserts the scroller rule rather than measured clipping, because the test fixture's buttons measure narrower than the live app's, so a measured-overflow assertion would pass vacuously on the original CSS.

## Checked with no defect found

- Full-matrix measurement: no document horizontal overflow and no off-viewport controls on any of the 12 routes at 375 and 768, in light and dark themes, after the fixes.
- Task drawer, Changes tab, at 375 and 768: the drawer fits the viewport, the quickbar wraps, and the tab row wraps to two rows at 375. No clipped buttons were found.
- Work queue at 375: the priority and area chip row scrolls horizontally on purpose, and its last visible chip is cut at the edge as a scroll affordance.
- Checks at 375 and 768: the tab strip fits, and the empty state is readable.
- Work board at 768, scrolled to end in each column: the last cards clear the toggle row and the integration pill.

## Not verified

- Settings content and Releases content stayed on loading skeletons. The console recorded access-control 401s for API calls such as `/api/release/run`, `/api/repo/status`, `/api/reminders` and the per-task diff-stats calls, so the Settings forms and the Releases cut panel were not seen at 375 or 768. #1157 recorded similar 401s.
- Interactions beyond opening the drawer were not exercised at these widths: dialogs, the new-task panel, inputs and stories surfaces, and the Releases cut panel.
- The 901–1000px band still uses the desktop dock with its 520px reservation. At 1000px that leaves roughly 244px for the toggles. This was not measured, and it is outside 375 and 768, so it is a candidate follow-up.
- Real devices and touch input were not tested.

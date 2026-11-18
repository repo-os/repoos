# Web app QA pass: mobile widths 375 and 768 — November 2026

Task #1170. This pass covers the 375 and 768 CSS-pixel widths on the main pages. The 390 and 320 widths were covered by #1157, and its fixes are not repeated here. Because 768 sits in a band where the layout changes, the fixes also cover the neighbouring widths (720 to 1100px) where the same rules apply.

## Scope and method

The pass ran against this task worktree, with `just serve-noauth` on port 7272 and WebKit Playwright. It did not use the served checkout.

- Routes measured: Dashboard, Work, Releases, Settings, Agents, Checks, Stories, Inputs, Secrets, Dev, Context, Deployments.
- Widths: 375 and 768, in light and dark themes. That is 48 page loads.
- Per page, the script records document horizontal overflow and every visible element whose box extends past the viewport. Elements inside a horizontal scroller are excluded on purpose, because a scroller is a valid way to reach overflowing content.
- Screenshots were also taken and inspected for the pages and states listed below.
- Reproduce the measurement with `QA_THEMES=light,dark QA_SHOTS=<dir> bun docs/qa/measure-mobile-widths.mjs` against a running `just serve-noauth 7272`. The script is committed under `docs/qa/`.
- Regression coverage for the fixes: `src/ui-app/tests/tablet-rail-layout-browser.test.ts`, twelve WebKit geometry cases.

## Findings and disposition

| Finding | Evidence | Disposition |
| --- | --- | --- |
| Settings tab strip clipped the last tab between 761 and about 957px | At 768px the seven-tab strip measured 656px wide, but its tabs need about 695px. The "repoos.toml" tab reached x=781 in a 768px viewport and was cut at the content edge. The scroller rule ended at 760px. At 901–957px the 210px sidebar leaves the strip narrower still. | Fixed: the scroller rule now covers widths up to 960px (`src/ui-app/src/style.css`). |
| Sidebar rail spilled its theme switcher and build widget at 720–900px | The 60px icon rail showed the starred-theme buttons ("Classic", "Clear", "Gen Z") and the build hash at negative x, so their labels were cut off at the rail edge. The rail rule hid `.theme-switch` and `.build-widget`, but later base rules with the same specificity set `display: flex` and won. | Fixed: the rail rule is scoped to `.sidebar`, so it wins (`src/ui-app/src/style.css`). |
| Work parked toggles overlapped the Active column and the integration pill at 761–1100px | The fixed dock assumed the 210px sidebar and reserved 520px for the centred pill. At 768px that left about 12px, so "Human (11)" wrapped and the chips covered Active column cards, including the "Restart work" button. At 1000px the same reservation left about 244px. | Fixed: from 761 to 1100px the row sits above the pill, one line tall, and spans from the sidebar edge (or the 60px rail, up to 900px) to the right gutter. The column end inset already clears it: at scroll end the last Active card ends about 50px above the row. Below 761px the phone reflow keeps the Work board in normal flow, as before, and the dock is not applied. |
| Floating avatars cover the theme star buttons on Settings › General at 768px | The floating heads default to visible at widths of 720px and above. On the theme list they sit over the rightmost star control of the Hypercolor row. | Not changed. The heads are a draggable overlay the user controls, and their default placement is a product decision. A human should decide whether tablet widths should start them hidden or at a corner. |

Regression tests: twelve WebKit cases in `src/ui-app/tests/tablet-rail-layout-browser.test.ts`, covering the rail hide (720, 768, 900px), the Settings strip (720 to 960px), the Work dock (768, 900, 1000px), and a 740px check that the dock stays out of the fixed flow. Four of the twelve fail on the original CSS, which shows they catch the bugs above. The Settings cases assert the scroller rule rather than measured clipping, because the test fixture's buttons measure narrower than the live app's, so a measured-overflow assertion would pass vacuously on the original CSS.

## Checked with no defect found

- Full-matrix measurement: no document horizontal overflow and no off-viewport controls on any of the 12 routes at 375 and 768, in light and dark themes, after the fixes.
- Task drawer, Changes tab, at 375 and 768: the drawer fits the viewport, the quickbar wraps, and the tab row wraps to two rows at 375. No clipped buttons were found.
- Work queue at 375: the priority and area chip row scrolls horizontally on purpose, and its last visible chip is cut at the edge as a scroll affordance.
- Checks at 375 and 768: the tab strip fits, and the empty state is readable.
- Work board at 768, scrolled to end in each column: the last cards clear the toggle row and the integration pill.

## Not verified

- The Work dock with an expanded integration pill. The dock sits 66px above the screen bottom, which assumes the pill is no taller than about 52px. The expanded pill grows upward and could reach the toggles. The regression test renders only the idle pill. This is an open risk at 761–1100px.
- Settings content and Releases content stayed on loading skeletons. The console recorded access-control 401s for API calls such as `/api/release/run`, `/api/repo/status`, `/api/reminders` and the per-task diff-stats calls, so the Settings forms and the Releases cut panel were not seen at 375 or 768. #1157 recorded similar 401s.
- Interactions beyond opening the drawer were not exercised at these widths: dialogs, the new-task panel, inputs and stories surfaces, and the Releases cut panel.
- Real devices and touch input were not tested.

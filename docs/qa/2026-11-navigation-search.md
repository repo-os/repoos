# Navigation and search QA — 2026-11-18

## Result

The pass found and fixed two bugs. Desktop Work deep links removed `task` and
`tab` from the URL immediately after opening the drawer, so a reload lost both
the task and selected tab. The palette also failed to match the `#` prefix
shown beside task IDs. The drawer now keeps deep-link parameters while open and
clears them when dismissed; task ID search accepts the displayed `#` form.

## Environment and coverage

- Started this worktree with `just serve-noauth 7272` and used an isolated
  Playwright Chromium context. The computer-use browser bridge was unavailable,
  and the machine's existing Chrome window did not provide a safe isolated tab.
- Checked at 1280 × 900 and 375 × 812. The 375px Work page had a 375px document
  width and displayed its mobile navigation bar.
- Loaded `/`, `/login`, `/work`, `/client-board`, `/stories`, `/checks`, `/dev`,
  `/secrets`, `/releases`, `/deployments`, `/inputs`, `/repo`, `/settings`,
  `/agents`, `/tasks/1186/diff`, `/tasks/1186/conflict-diff`,
  `/repo/working-diff`, and `/repo/commits/abcdef1`. Every document request
  returned HTTP 200 and rendered page content. The arbitrary commit hash has no
  matching commit, so that page correctly showed “commit not found.”
- Clicked Work from the dashboard, then exercised browser Back and Forward;
  the location returned to `/` and then `/work`.
- Loaded `/work?task=1186&tab=changes`, confirmed the task drawer and Changes tab,
  reloaded, and confirmed both remained open. Closing the drawer removed
  `task` and `tab` from the route.
- At 1280px, opened the palette with Ctrl+K, searched `#1186`, and pressed Enter;
  the matching task drawer opened. At 375px, opened Search from the mobile tab
  bar, searched `#1186`, and selected the result; the same task drawer opened.
- No JavaScript page errors were observed in the route/action runs. The
  Deployments page made an expected auth-gated request to
  `/api/project-environments`, which returned 401 because that endpoint
  requires a signed-in user. The intentionally invalid commit lookup returned
  404. Neither response prevented its page from rendering.

## Fixes and regression coverage

`WorkView` now retains the task and optional tab query while its drawer is open,
including for the new-task panel. `TaskDrawer` clears those parameters on close
for desktop and mobile, preserving other query keys. Deep-link tests now verify
that task and tab state survives a simulated remount, including a Changes-tab
link. Search matching strips a leading `#` for task ID matching, with a
regression test for the displayed ID notation.

Verification: `bun run build:ui` passed. `bun run test --
src/ui-app/tests/search.test.ts src/ui-app/tests/deep-link-params.test.ts`
passed: 58 tests, including the wrapper's boot-timing pass. The final required
scoped `repoos check` is recorded by the task handoff.

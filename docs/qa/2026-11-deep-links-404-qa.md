# QA: error pages, 404 routes and deep links (#1252)

Scope: unknown routes, deleted or unknown task links, archived task links,
wrong tab ids, Settings deep links and reload, checked at 375, 768 and 1280 px.

Method: headless Playwright (WebKit) against fixtures only. No visible browser,
no live server, no Dev login. The browser checks mount the real components in
jsdom and lay their markup out in headless WebKit with the built global
stylesheet. Re-run with `QA_SHOTS=<dir>` to save a screenshot per case and width.

## Results

| # | Case | Before | After | How verified |
| --- | --- | --- | --- | --- |
| 1 | Unknown route (`/no-such-page`, `/work/x/y`, `/tasks/9999`) | Silently redirected to the dashboard. The bad link was hidden and nothing explained it. | Shows "This page doesn't exist" with the path, plus **Go to Work** and **Dashboard**. Stays inside the app shell so the nav works. | Router resolution test; WebKit layout at 375/768/1280 |
| 2 | Deleted or never-existed task (`/work?task=9999`), desktop | The queue rendered with no message. The param stayed in the URL and nothing opened. | Shows "This task isn't on the board" with **Back to Work**, which clears the param. | WebKit layout at 375/768/1280 (markup from the same `RouteNotice` the page uses). The fetch-failure branch is covered by reading the code, not a live server. |
| 3 | Unknown task on a phone (`/work?task=9999`) | Existing "Task unavailable" shell with **Return to Work**. | Unchanged. | Code read only |
| 4 | Archived task (`/work?task=<archived id>`) | Archived tasks stay in the store (`repo.tasks`, filtered by `isArchived`), so they open the drawer like any other task. | Unchanged. | Code read only (`stores/repo.ts`). Not clicked in a browser. |
| 5 | Wrong tab id (`/work?task=<id>&tab=bogus`) | `tabFromQuery` rejects anything outside `DRAWER_TABS` and the drawer opens on its default tab. | Unchanged. | Code read only |
| 6 | Wrong Settings tab (`/settings?tab=bogus`) | Falls back to General. | Unchanged. | Code read only (`SettingsView.vue` `activeTab`) |
| 7 | Bad Settings section (`/settings?section=bogus`) | Ignored; no scroll. | Unchanged. | Code read only (`activeSection`) |
| 8 | Reload on a deep link | State lives in the URL, so a reload re-runs the same lookup and lands in the same place. | Unchanged. | Code read only (`openFromTaskParam`). Not reloaded in a browser. |

## Changes

- `src/ui-app/src/router.ts`: the catch-all is now a `not-found` route with its
  own view instead of `redirect: "/"`.
- `src/ui-app/src/views/NotFoundView.vue`: new. Reads `route.fullPath` for the
  message.
- `src/ui-app/src/components/RouteNotice.vue`: new shared card (title, one line
  of explanation, a slot for the way-back controls). Used by the not-found view
  and by the Work notice.
- `src/ui-app/src/views/WorkView.vue`: `missingTaskId` records a `?task=` id that
  could not be loaded. The desktop Work page shows the notice while it is set.
  Clearing the param, starting a new lookup, or a successful open clears it. The
  request token still stops a stale failure from overwriting a newer request.
- `src/ui-app/src/style.css`: global `.route-notice*` and `.route-not-found`
  rules, so the notice needs no scoped styles.
- Tests: `src/ui-app/tests/router-not-found.test.ts` (route table) and
  `src/ui-app/tests/deep-links-404-qa-browser.test.ts` (WebKit layout at three
  widths, including a way-back link inside the viewport).

## Not covered here

- A live, logged-in click-through of the drawer for a deleted, archived or
  wrong-tab link. That needs a running server and Dev login, and the task brief
  asks for fixtures only, so it was not run. The archived, wrong-tab and reload
  rows above rest on reading the code.
- Real device testing. The 375/768/1280 checks are headless WebKit layout
  checks, not hardware. A human should confirm the touch targets on a phone if
  that matters for sign-off.

# Slow network and offline QA pass — November 2026 (#1226)

## Scope and method

The web app and Hub were exercised under three network failure modes — dead
server (offline), HTTP 500 responses, and stalled responses that outlive the
client's own timeouts — across the Work board, the task drawer, Agents and
Settings, at 375, 768 and 1280 px. Headless Playwright (WebKit) only, against
the built app served from a throwaway fixture root; every failure mode is
produced with request interception (`page.route`), never a real outage, a
visible browser, or focus stealing. The harness reuses the shared
`src/commands/ui-harness.ts` server/WebKit launch and extends its structural
route type with `abort` (dead network), `fetch` passthrough (slow-then-real)
and `unroute` (recovery).

Regression tests live in `src/ui-app/tests/offline-slow-network-browser.test.ts`
(9 tests, ~35 s) plus unit tests for the fixes called out below. Skips cleanly
when Playwright/WebKit is not installed, like the other browser gates.

## What already worked (found during the pass)

| Surface | Behavior observed |
| --- | --- |
| Work board, offline or 500 | `loading` resolves in `finally`, so the board never spins forever; a `role="alert"` panel reads "Couldn't load this project's tasks" with the server's own message and a Retry button. |
| Agents, offline or 500 | Skeleton is replaced by "Couldn't load agents" with Retry (was `.agents-load-error`, now the shared `.page-load-error` panel). |
| Task drawer with failing task endpoints | The drawer opens from store data, degrades its sub-fetches silently, and never blanks or throws an uncaught error. |
| Global recovery banner | A refused connection and a timeout are worded differently ("is not running" vs "is not responding") with a Retry / reload action; the timeout wording comes from `api()`'s 15 s GET budget, so a stalled server is always reported instead of hanging. |
| Recovery of the data itself | When the server returns, the SSE stream reconnects on its own (jittered backoff), every reconnect runs a full board refresh, and the page fills in without user action. |
| Narrow widths | All three error panels wrap and stay inside the viewport at 375/768/1280 (asserted via `scrollWidth − innerWidth`). |

## Findings fixed

1. **A stalled `/api/auth/me` froze the whole app on an endless skeleton**
   (`src/ui-app/src/stores/auth.ts`). The auth check is plain `fetch` with no
   timeout, and both the router guard and App's `onMounted` await it before
   anything else loads. A server that accepts the connection but never answers
   (the "slow" case) therefore left every page — Work, Agents, Settings, the
   drawer — spinning forever with no message. The request is now bounded at
   6 s; a timeout is treated like any other failure (auth off, app renders),
   and a reload picks up the real answer. Unit tests: `auth-stall.test.ts`;
   browser test: "stalled auth check: the app still boots".

2. **The offline banner outlived a self-recovered page**
   (`src/ui-app/src/lib/uiRecovery.ts`, `stores/repo.ts`). The board recovers
   on its own when the SSE stream reconnects, but the "…is not running" banner
   stayed up until the user focused or navigated — the page contradicted
   itself. `clearOfflineOnStreamBack()` now clears the offline banner the
   moment the stream is demonstrably back (never while a manual reload is in
   progress, and never for a stale-build banner). Unit tests: `ui-recovery.test.ts`;
   browser test: "recovers the board and clears the banner on its own".

3. **Settings showed an endless skeleton when `/api/config` failed**
   (`src/ui-app/src/views/SettingsView.vue`, restored from the crashed first
   session and verified here). The tab strip rendered but the panel body waited
   on a config that would never arrive. It now shows "Couldn't load settings"
   with Retry and suppresses the skeleton once the failure is known; the same
   panel is shared with Agents (`.page-load-error`). Unit tests:
   `settings-load-error.test.ts`, `agents-view-cards.test.ts`.

For review, the two panels are captureable on a healthy preview via the new
shot-state fixtures `settings:loadFailed` and `agents:loadFailed`
(`src/core/shot-fixtures.ts`, capture-only and unpersisted); Work already had
`work:failedLoad`.

## Matrix actually exercised

| Scenario | Work | Drawer | Agents | Settings | Widths |
| --- | --- | --- | --- | --- | --- |
| All `/api/**` aborted (offline) | error panel + banner | n/a — no task data to open from (board error covers it) | error panel | error panel | 375/768/1280 overflow check |
| All `/api/**` → 500 with JSON error | server's message shown | drawer sub-fetches 500, drawer still opens with title + tabs | error panel | error panel | — |
| `/api/auth/me` stalls | app still boots, board renders | — | — | — | — |
| `/api/health` + `/api/board` stall | "did not respond in time" + "is not responding" banner | — | — | — | — |
| Server returns after offline | board self-recovers, banner clears itself | — | agents panel recovers via its own Retry (banner cleared) | — | — |

No uncaught page errors (`pageerror`) occurred in any scenario. Console noise
from deliberately failed API requests is expected and not recorded as a
finding.

## Deliberately not exercised

- Login screens under failure (public routes; the auth store's failure path is
  unit-tested).
- A real device, real radio offline mode (`navigator.onLine` gates), or
  bandwidth throttling at the TCP level — the QA criterion is request
  interception only.
- The Hub's native (Capacitor) shell. The Hub loads this same SPA in its
  WebView, so every page-level behavior above applies to it, but the native
  shell's own loading/return-to-picker screens were not driven in this pass —
  that needs a device and is tracked separately rather than claimed here.

## Check

The scoped `repoos check` result is recorded by RepoOS at handoff. The new
browser suite passed twice consecutively (9/9), and the touched unit suites
(auth, ui-recovery, settings-load-error, agents-view-cards) pass.

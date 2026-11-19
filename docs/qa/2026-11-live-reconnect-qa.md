# Live reconnect QA — 2026-11

## Scope and setup

QA covered the **Control** dashboard (`/`) across a simulated server outage at
375, 768 and 1280 px. The Work board was not exercised in the browser in this
pass: it shares the same store refresh and SSE path, but its rendering was not
checked here.

The browser run used headless Playwright WebKit only, against the built UI
(`dist/ui`) served by a fixture server in the test process. Nothing was run
against a real RepoOS server, and no preview was requested. The outage is
simulated by closing the listener and every open event stream, then listening
again on the same port. The first board request after the restart is refused
with HTTP 503, the way a server still finishing its boot index behaves. The
page is never reloaded, and a marker on `window` confirms that.

Test files:

- `src/ui-app/tests/live-reconnect-qa-browser.test.ts` — the three-width
  WebKit run (`QA_SHOTS=<dir>` saves screenshots).
- `src/ui-app/tests/live-reconnect-recovery.test.ts` — jsdom store tests for the
  retry and the banner.
- `src/ui-app/tests/conn-indicator.test.ts` — pill copy, updated.

## Results

| Width | Pill while down | Board after restart (no reload) | Pill after restart | Page width |
| --- | --- | --- | --- | --- |
| 375 px | "reconnecting", red, inside the viewport, ≥60 px wide | "ready to start" goes 0 → 3 | cleared | ≤ viewport |
| 768 px | "reconnecting", red, inside the viewport | 0 → 3 | cleared | ≤ viewport |
| 1280 px | "reconnecting", red, inside the viewport | 0 → 3 | cleared | ≤ viewport |

Screenshots are committed beside this note:

| State | 375 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Reconnecting | [375](2026-11-live-reconnect-assets/reconnecting-375.png) | [768](2026-11-live-reconnect-assets/reconnecting-768.png) | [1280](2026-11-live-reconnect-assets/reconnecting-1280.png) |
| Recovered | [375](2026-11-live-reconnect-assets/recovered-375.png) | [768](2026-11-live-reconnect-assets/recovered-768.png) | [1280](2026-11-live-reconnect-assets/recovered-1280.png) |

## Regression evidence

The browser test was run against a bundle built from the **original**
`repo.ts`. It failed at all three widths: the "ready to start" count stayed at
`0` after the server returned, because the reconnect refresh had been refused
and nothing retried it. With the fix, the same test passes at all three widths.

The jsdom store tests fail on the original code as well. The retry test fails
at `expected 2 to be 3`, and the banner test fails at `expected 3 to be ≥ 4`,
so its banner assertion was never reached on the original code. The
"stream error cancels a pending retry" test passes on the original code,
because there is no retry to cancel yet; it guards the new behaviour.

## Problems found and fixed

1. **Stale board after a failed reconnect refresh.** Every SSE open refreshes
   the board, because frames sent while the stream was down are not replayed.
   That refresh's failure was swallowed. The counts and the error stayed until
   some other frame arrived, and on a quiet repo none does. The refresh now
   retries with the stream's jittered backoff, and a stream error cancels the
   pending retry because the next open refreshes anyway (`refreshBoardOnOpen`
   in `src/ui-app/src/stores/repo.ts`).
2. **Offline banner that outlived a recovered board.** A timed-out refresh
   raises the offline banner. On a healthy stream, only a frame or an open
   clears it, so an idle page kept saying "offline" next to a board that had
   loaded. A board that loads now clears the banner.
3. **Plain-English state.** The header pill said "offline" with the tooltip
   "Server is disconnected". It now says "reconnecting", with matching
   `aria-label` and `title`.
4. **The phone pill had no words.** Below 720 px the CSS hid the text and left a
   dot in the inherited header colour, so at 375 px the state was not visible as
   text. The pill now keeps the word, uses the red tint, and is pinned with
   `flex-shrink: 0`.

## Residual issues (not fixed here)

- **Project chip at 375 px.** While the pill is up, the repo chip in the header
  narrows to a sliver (about 15 px). At 768 px it wraps onto three lines. The
  project name still appears in the Control subtitle. The chip is
  `flex: 1 1 auto` by design, so this is a header layout question, not a
  one-line fix.
- **No "last updated" marker.** During an outage the Control counts keep their
  last-known values and nothing on the page says they are stale. Only the pill
  signals it.
- **Silent connections.** The client cannot see the server's 25 s `: ping`
  comments, and it has no idle watchdog. A half-open connection on a quiet
  repo is therefore detected only when the browser reports an error. A real
  laptop sleep or proxy drop was not tested here.
- **Real server.** The restart is a fixture restart. A real `repoos serve`
  restart, with its index build and reload handoff, still needs a human to
  check on their own machine.

## Verification

- `src/ui-app/tests/live-reconnect-recovery.test.ts`,
  `src/ui-app/tests/conn-indicator.test.ts`,
  `src/ui-app/tests/offline-banner-stream-frames.test.ts`,
  `src/ui-app/tests/repo-store.test.ts`, `src/ui-app/tests/sse-backoff.test.ts`
  and `src/ui-app/tests/index-fetch-dedupe.test.ts` pass (89 tests).
- `src/ui-app/tests/live-reconnect-qa-browser.test.ts` passes at 375, 768 and
  1280 px (headless WebKit, fixtures only).
- `REPOOS_CHECK_CHANGED=main repoos check`: exit 0. All 164 UI test files and
  the second pass passed, along with the UI smoke test (1440, 390 and 320 px,
  light and dark) and the rendered contrast audit.

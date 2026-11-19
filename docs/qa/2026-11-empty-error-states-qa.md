# Empty, loading and error state QA — 2026-11

## Scope and method

Reviewed Agents, Checks and Releases for empty, first-load, and failed-load behavior. Used headless Playwright with deterministic API route fixtures against the managed task preview; no visible browser was opened. The focused UI suite covers the view state behavior.

## State results

| Page | Empty | Loading | Error and recovery |
| --- | --- | --- | --- |
| Agents | `agents:empty` explains that no agents are configured and offers built-in choices without changing saved config. | A pending `/api/config` keeps the page title, tabs, and card skeleton visible. | A failed `/api/config` now replaces the skeleton with an alert and Retry. The initial raw server detail is hidden from the page subtitle. |
| Checks | An empty plan with `source: "empty"` and no steps shows “No checks configured”; no recorded run has its own neutral explanation. | A pending `/api/check-plan` shows the plan skeleton. Cached plan data remains visible on refresh. | A failed first load is announced as an alert; failed refreshes with cached content remain a status update. |
| Releases | A disabled release configuration explains how to enable the page. | A pending `/api/release` shows the page skeleton. | Failed initial status is an alert; refresh failures retain loaded status and use a status announcement. |

## Headless Playwright viewport review

Captured all three states on all three pages at 375×900, 768×900, and 1280×900 CSS pixels: 27 viewport captures total. Pending fixtures held their primary API request open until capture; error fixtures returned a deterministic 503. The empty fixtures supplied no agent config, an empty valid check plan, and a disabled release status.

All 27 expected state elements appeared. Playwright observed no uncaught page errors, and both `documentElement.scrollWidth` and `body.scrollWidth` were at or below the configured viewport width for every capture. I inspected representative mobile screenshots: Agents' retry card wraps cleanly; the Checks reminder remains in scrollable page content above the bottom navigation; and Releases' loading skeleton fits the viewport. Screenshots and machine-readable results are retained in the ignored `.repoos/qa-evidence/1216/` directory.

## Changes

The viewport pass exposed an Agents bug: if initial `/api/config` loading failed, the view stayed on its skeleton with no recovery path. Agents now renders a plain-English alert with a Retry button and suppresses the raw initial config error from its subtitle. Checks and Releases initial load failures now carry `role="alert"`; refresh failures with cached data retain `role="status"`.

## Limits

The API failures above are simulated route fixtures, not live service failures. RepoOS's separate headless UI smoke test also passed, but the 27 captures above are the evidence for the requested page states and widths.

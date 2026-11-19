# Empty, loading and error state QA — 2026-11

## Scope and method

Reviewed the Agents, Checks and Releases views for first-load, empty and failed-load behavior. Used the existing UI fixtures and focused Vitest view tests in this worktree. No visible browser was opened. The focused suite completed with 123 tests passing across Agents, Checks, Releases and release status.

## Results

| Page | Empty | Loading | Error | Result |
| --- | --- | --- | --- | --- |
| Agents | `agents:empty` shows “No agents are set up for this project” and offers the built-in agent choices without changing saved config. | An unresolved config request keeps the page title and tabs usable and shows the card skeleton; secondary tabs wait for loaded config. | Per-CLI model lookup and model test failures show actionable inline guidance and retry paths. | Pass. Existing coverage exercises empty, loading and model-error cases. |
| Checks | A valid zero-step plan gets the setup reminder; no recorded run has a neutral explanation. | The plan skeleton is shown only when there is no cached plan; a cached plan remains usable during refresh. | A refresh failure preserves cached plan content and reports “Refresh failed”. A first-load failure uses an alert role. | Pass. Added regression assertion for the cached refresh status role. |
| Releases | Disabled release configuration explains how to enable the page. Empty distribution data does not create a misleading channel card. | The page and distribution channel cards use skeletons during first load; refresh retains current data. | Initial status failure uses an alert role; failed refreshes are announced while retaining loaded status. Distribution refresh failures remain inline. | Pass. Initial load alert semantics were made consistent with Checks. |

## Viewport review

The requested widths are 375, 768 and 1280 CSS pixels. The changed-path RepoOS check passed its configured headless UI smoke test. Its output reports Checks tabs at 320, 390 and 1440 px in light and dark mode. It does not report runs at the requested 375, 768 and 1280 px, nor viewport results for Agents and Releases. The task worktree has no managed preview request, and its instructions prohibit launching `repoos serve`; I therefore do not claim those viewport checks were completed. No new layout styling was required by the state review.

## Changes

Initial load failures on Checks and Releases now carry `role="alert"`, matching the urgency of a page that could not load any usable content. Checks retains `role="status"` for a refresh failure because the cached plan remains available. The checks view regression test locks in that distinction. Agents already exposes its setup, loading and model failure states in plain language and remained unchanged.

## Follow-up

If visual viewport evidence is needed, capture the three pages at 375, 768 and 1280 px through the managed headless preview workflow when requested. No live external service failure was simulated; API failures were deterministic test fixtures/stubs.

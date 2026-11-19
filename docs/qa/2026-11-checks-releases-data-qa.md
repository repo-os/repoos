# Checks and Releases data QA — November 2026

## Scope

Headless WebKit mounted the actual `ChecksView.vue` and `ReleasesView.vue` components at 375, 768, and 1280 CSS pixels. The fixture contains 24 check rows and 24 release channel cards. Every name, URL and install command mixes long hyphenated paths with a 120-character unbroken token, so a missing flex/grid minimum or wrap rule widens the document or clips the text. Mock API responses are delayed (350 ms for the check plan, 100 ms otherwise) so the test observes the loading skeleton before the data. The test asserts all rows render, every row/name/badge/command/control stays inside the viewport, names wrap without being clipped, install Copy buttons stay visible and enabled, and the Releases “Check again” action stays inside the viewport and issues a second distribution request.

## Findings and fixes

Check step names did not have an explicit flexible minimum or wrapping behavior. Added `min-width: 0` and `overflow-wrap: anywhere` so a long identifier can break inside the flexible row body. Command snippets remain horizontally scrollable for command fidelity and are now constrained to the available row width.

The first strengthened run found a second, real overflow: with unbroken channel names, each `.rel-channel` card grew to ~1466 px wide at every viewport. The `.rel-dist-channels` grid track and its channel cards had automatic minimum sizes, and the `.rel-installs` grid did the same for install rows. Added `minmax(0, 1fr)` tracks plus `min-width: 0` on the channel and install rows, and `overflow-wrap: anywhere` on channel names and detail text. The install command now scrolls inside its own code box instead of widening the card.

## Verification

The Playwright test `src/ui-app/tests/checks-releases-data-responsive.test.ts` passed for all three widths in headless WebKit against the real page components. Temporarily restoring the pre-fix `ChecksView.vue` makes the test fail at 375 and 768 px, and the earlier pre-fix Releases CSS failed all three widths, so the test is a real regression check rather than a synthetic layout copy. API fixtures delay each response; this is a deterministic loading scenario, not a live server dataset or measurement of network latency. Only the repo store is stubbed to avoid unrelated server behavior.

The task’s declared shots use the new `checks:longData` and `release:longDistribution` preview fixtures, so the captured Checks and Releases screens show the same long data this test exercises instead of the tidy live plan.

## Remaining coverage

This pass focuses on long check and release data and viewport fit. It does not exercise every release action's server-side behavior or measure real slow network performance; those behaviors remain covered by the page's existing interaction and loading tests.

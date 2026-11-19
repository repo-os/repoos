# Checks and Releases data QA — November 2026

## Scope

Headless WebKit mounted the actual `ChecksView.vue` and `ReleasesView.vue` components at 375, 768, and 1280 CSS pixels. The fixture contains 24 check rows and 24 release channel cards, long unbroken step/channel names, lengthy command paths, and package URLs. Mock API responses are delayed by 100 ms to exercise asynchronous loading. The browser test asserts all rows render, neither page widens beyond the viewport, and the Releases “Check again” action triggers another distribution request.

## Findings and fixes

Check step names did not have explicit wrapping behavior. Added `overflow-wrap: anywhere` and `min-width: 0` so a long identifier can break inside the flexible row body. Command snippets remain horizontally scrollable for command fidelity and are now constrained to the available row width. Long release channel names also needed an explicit flexible minimum width and safe wrapping; added both to the real channel header. Release provider metadata wrapping now applies at all widths, and the Published-to description wraps unbroken package URLs.

## Verification

The Playwright test `src/ui-app/tests/checks-releases-data-responsive.test.ts` passed for all three widths in headless WebKit. Each case rendered 24 real check rows and 24 real release channel cards, found no viewport-wide horizontal overflow, and confirmed the channel action remained inside the viewport and caused a second API request. API fixtures delay each response; this is a deterministic loading scenario, not a live server dataset or measurement of network latency. The harness mounts the page views with their actual Vue templates and scoped styles; only the repo store is stubbed to avoid unrelated server behavior.

## Remaining coverage

This pass focuses on long check and release data and viewport fit. It does not exercise every release action's server-side behavior or measure real slow network performance; those behaviors remain covered by the page's existing interaction and loading tests.

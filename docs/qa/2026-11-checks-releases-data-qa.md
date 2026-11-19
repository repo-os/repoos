# Checks and Releases data QA — November 2026

## Scope

Headless WebKit exercised long and numerous check steps plus release channel metadata at 375, 768, and 1280 CSS pixels. The fixture contains 24 check rows and 24 channel metadata rows, long unbroken step names, lengthy command paths, and repeated package URLs. A short delayed wait models the transition while data arrives. The browser test asserts all rows render, the page does not widen beyond the viewport, a page action remains inside the viewport, and long check titles use safe wrapping.

## Findings and fixes

Check step names did not have explicit wrapping behavior. Added `overflow-wrap: anywhere` and `min-width: 0` so a long identifier can break inside the flexible row body. Command snippets remain horizontally scrollable for command fidelity and are now constrained to the available row width. Release provider metadata already received narrow-screen wrapping; that rule now applies at all widths, and the Published-to description also wraps unbroken package URLs.

## Verification

The Playwright test `src/ui-app/tests/checks-releases-data-responsive.test.ts` passed for all three widths in headless WebKit. Each case rendered 24 check rows and 24 release metadata rows, found no viewport-wide horizontal overflow, and confirmed the primary channel action remained visible. The delayed wait checks that the fixture is evaluated after the loading interval. This is a deterministic component-structure fixture, not a live server dataset or measurement of network latency.

## Remaining coverage

This pass focuses on long check and release data and viewport fit. It does not exercise every release action's server-side behavior or measure real slow network performance; those behaviors remain covered by the page's existing interaction and loading tests.

---
id: "0200"
title: Re-enable the disabled headless UI smoke test
type: bug
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/re-enable-the-disabled-headless-ui-smoke
created_at: "2026-08-14T15:19:46Z"
updated_at: "2026-08-14T16:17:09Z"
---
## Problem

The headless UI smoke test (part of `repoos check`) was disabled because
Playwright or the WebKit browser binary was having a problem. As a result,
`repoos check` no longer validates that the app mounts, that no unrendered
mustache remains in the DOM, and that there are zero console errors. This
removes an important safety net from the single "did this break anything?" bar.

## Desired UX

`repoos check` runs the headless browser UI smoke test again: it mounts the app,
asserts no unrendered mustache in the DOM, and asserts zero console errors. When
Playwright or the browser binary isn't installed, the test skips with a clear
message (preserving the existing behavior).

## Acceptance criteria

- [ ] The headless UI smoke test is re-enabled and runs as part of `repoos check`.
- [ ] The test mounts the app, verifies no unrendered mustache in the DOM, and
      verifies zero console errors.
- [ ] When Playwright or the browser binary isn't installed, the test still
      skips with a clear message.
- [ ] `repoos check` passes end-to-end with the smoke test running.

## Notes for AI

- The root cause of the Playwright/WebKit problem should be investigated before
  simply re-enabling; do not paper over a flaky or broken setup.
- If the browser binary is missing locally, install it as needed rather than
  re-disabling the test.
- Zero runtime dependencies is a hard constraint; Playwright is only a dev
  dependency (test runner), which is acceptable.

## Related

- `repoos check` definition (AGENTS.md)
- Headless browser UI smoke test (WebKit) in the existing check pipeline

## Activity

- 2026-08-14T15:19:46Z · created · unknown
- 2026-08-14T15:25:28Z · status inbox→ready
- 2026-08-14T16:17:09Z · status ready→active, branch

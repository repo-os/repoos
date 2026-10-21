---
id: "0905"
title: check-remote-wip test breaks when the gate runs with browser steps offloaded (REPOOS_OFFLOAD_BROWSER_STEPS=1)
type: feature
status: active
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/check-remote-wip-test-breaks-when-the-ga
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T16:03:26Z"
updated_at: "2026-10-21T16:22:36Z"
---
## Problem
2026-10-21: with remoteValidation.browserCaptureMode = runner-only, validate.sh passes REPOOS_OFFLOAD_BROWSER_STEPS=1 (and the REPOOS_BROWSER_CAPTURE_* variables) into the repoos-ci container. tests/check-remote-wip.test.ts ('managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created') does not clear them, so the managed check takes the 'uncommitted changes ... running the full local gate on the working tree instead' path and never prints 'could not commit a WIP checkpoint'. Result: every task's remote gate failed on this test from ~22:59 to ~23:37 (#0899, #0900, #0897 handoffs), blocking all shipping for about an hour. Reverting the capture policy to local made the gates pass again. The test passes in isolation in the runner container, so it only breaks when those env vars are set. This also blocks the #0864 end-to-end proof (needs runner-only).

## Desired UX
No test depends on whether browser capture is offloaded. Enabling runner-only browser capture never changes unrelated test results.

## Acceptance criteria
- tests/check-remote-wip.test.ts (and any test that runs the managed check) saves, clears and restores REPOOS_OFFLOAD_BROWSER_STEPS and all REPOOS_BROWSER_CAPTURE_* variables, proven by running it with them set to offload values.
- A scan test or lint step fails when a test reads process.env.REPOOS_* values that validate.sh can inject without clearing them (or a shared helper clears the whole injected set once).
- Run the full suite in the repoos-ci container with REPOOS_OFFLOAD_BROWSER_STEPS=1 and the capture variables set and show it passes.
- Document in docs/debugging-check-failures.md: how browser-capture env leaks into gate tests and how to recognize it.

## Notes for AI
See scripts/remote-runner/validate.sh (the -e REPOOS_OFFLOAD_BROWSER_STEPS / REPOOS_BROWSER_CAPTURE_* lines) and src/ui-app/tests/check-remote-wip.test.ts runManagedCheck. After this lands the driver will set runner-only again for the #0864 proof.

## Activity

- 2026-10-21T16:03:26Z · created · njachowski@gmail.com
- 2026-10-21T16:04:10Z · status inbox→ready
- 2026-10-21T16:04:21Z · cli_override, model_override
- 2026-10-21T16:04:25Z · status ready→active, branch
- 2026-10-21T16:17:52Z · body
- 2026-10-21T16:22:36Z · body

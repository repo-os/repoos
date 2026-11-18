# Releases and restart notice QA — 2026-11-18

## Result

No product defects were found. No source fixes or follow-up tasks were needed. The only issue during the pass was in the Playwright sequence: cancelling the first pending request closed the cut drawer, so the script had to reopen it before exercising the second choice. The app behaved as designed.

Screenshots are stored locally under the ignored path `.repoos/qa-evidence-1168/`; they are deliberately not included in git. I inspected every captured screenshot. The releases captures show the chooser, pending Notify, and pending Publish states. Restart captures cover every supervisor, viewport, and theme combination described below.

## What I drove

I built and ran `just serve-noauth 7278` from a disposable detached scratch worktree under `.repoos/qa-scratch-1168`, not from the served checkout. I used the existing `release:cutReady` fixture to make the cut panel ready. Playwright opened Releases, opened the cut drawer, and opened the “When the AI notes are ready” chooser.

The chooser showed both choices and their descriptions. Publish said it would publish the exact release when notes land after the normal Publish checks. Notify said the notes would be filled in for review and the operator must press Publish. Playwright intercepted the notes POST and auto-publish GET/DELETE requests, returning pending records locally instead of starting an agent. I selected Notify, confirmed its request used `whenReady: notify`, reloaded while pending, confirmed the Notify banner persisted and did not claim to publish, then cancelled it. I reopened the drawer, selected Publish, confirmed `whenReady: publish` and the version/tag, reloaded while pending, confirmed the guarded-publish banner persisted, then cancelled it. I did not click Publish.

The browser reported no page errors. The failed-draft test in `release-auto-publish.test.ts` verified that an AI draft failure records the error and does not call the publish starter. The focused test run also covered the UI choice/cancel behavior and update-status handling.

## Restart notice matrix

I rendered the update/restart notice for each supervisor state using the existing restart notice fixture for hand-run and the existing update-status test payloads for launchd and systemd. Launchd and systemd API responses were intercepted in Playwright; no system service was restarted.

| Supervisor | 1440 light | 1440 dark | 390 light | 390 dark |
| --- | --- | --- | --- | --- |
| Hand-run | Captured and inspected | Captured and inspected | Captured and inspected | Captured and inspected |
| launchd | Captured and inspected | Captured and inspected | Captured and inspected | Captured and inspected |
| systemd | Captured and inspected | Captured and inspected | Captured and inspected | Captured and inspected |

Hand-run showed the recorded serve flags and port explanation, with a real “Restart now” action and “Restart when idle.” launchd and systemd showed the supervised restart actions without hand-run instructions. At 390 pixels, the modal and its text/actions remained within the viewport and readable. I did not click any restart action.

## Defects and disposition

- **Release chooser wording and pending states:** no defect found. Notify explicitly says nothing is published until the operator presses Publish; Publish remains tied to the selected tag and normal checks. No fix or task filed.
- **Hand-run restart notice:** no defect found. The notice offers “Restart now” and explains that RepoOS relaunches with recorded flags and port. No fix or task filed.
- **launchd/systemd restart notice:** no defect found. The supervised choices render without misleading hand-run copy. No fix or task filed.
- **Responsive/theme rendering:** no defect found in the captured 1440/390 light/dark states. No fix or task filed.

## Not tested

This pass did not cut or publish a release, push or tag anything, start a real AI agent, or restart the real server. It did not exercise a real launchd or systemd host; those two notice variants were rendered from test-shaped intercepted responses on this macOS host. The Publish/Notify browser requests were intercepted, so the browser pass verified UI state and request intent rather than a real agent completion. A failed draft was verified by the existing server test seam, not by running a live failed agent. No user-facing or service side effect was attempted.

## Verification

- `bun run test:vitest -- src/ui-app/tests/release-auto-publish.test.ts src/ui-app/tests/release-when-ready.test.ts src/ui-app/tests/update-status.test.ts` — passed, 39 tests.
- `REPOOS_CHECK_CHANGED=main repoos check` — passed in the preceding pass (remote validation, format, lint, build, and UI smoke).
- `repoos check --changed main` — passed on the final documentation tree. The docs-only path ran format, lockfile/runtime-dependency guards, task-asset validation, and task parsing; build, lint, tests, and UI smoke were skipped by the docs/bookkeeping-only check policy.

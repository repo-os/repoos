---
id: "1258"
title: "Mobile polish: open on Work, hide page scrollbar, even-height header row"
type: bug
status: active
priority: p2
area: [web, mobile]
assigned_to: ai
created_by: t@t
branch: feat/mobile-polish-open-on-work-hide-page-scr
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:15:33Z"
updated_at: "2026-11-20T09:54:16Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-20T09:49:11.145Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Work is the home page; header row controls share one height (target \"default\"): loading state detected: loading indicator [aria-busy=\"true\"] on /work (http://127.0.0.1:34337/work)"
review_rounds: 2
review_passes: 3
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: tests/mobile-touch-affordances.test.ts > mobile web polish (#1139) > gives top-bar controls a 44px touch target and keeps the project name visible, tests/mobile-touch-affordances.test.ts > mobile web polish (#1139) > turns search into a compact accessible icon button on phones, tests/shot-target-support-0866.test.ts > app target resolution (#0866) > keeps APP_ROUTE_PREFIXES in sync with the UI router on mini — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: 8c93e75b7ecddde45a3b16dc5cb0ed89d01739d1
---
## Problem
On a phone (seen on the Android Hub app, Mission Control page):
1. The app opens on Mission Control (the Control page). The first page should be Work.
2. A visible scrollbar sits on the right edge of the page, which wastes space and leaves the left and right gutters uneven. On mobile it is obvious the page scrolls.
3. The top-left project (repo name) chip is taller than the round icon buttons beside it and its text looks too light and small, so the header row looks uneven.
## Desired UX
- Opening the app (the root route, and the app launch on phone and desktop) lands on Work by default. Settings is an acceptable alternative only if Work is not feasible; default to Work. Deep links and a remembered last page, if any exist today, keep working.
- On phone widths the page scrollbar is hidden (the page still scrolls by touch) and the reclaimed space makes the left and right gutters equal. Desktop scrollbars stay as they are.
- Every control in the top header row (project chip, search, notifications, theme, help, account) is the same height and vertically centred. The project chip text is bolder and/or a little bigger so it reads clearly; its shape and radius match the neighbouring buttons.
## Acceptance criteria
- Default route is Work; a test covers opening / and the app start route. Check that nothing else (docs, links, redirects, Hub shell start URL) still assumes Control is the home page, and update docs that say so.
- Mobile page scrollbar hidden without breaking touch scrolling or keyboard scrolling; no horizontal page scroll; gutters equal at 375 and 412 px. Use theme tokens, not hard-coded colors.
- Header row controls share one height token; add a layout test (computed heights equal at 375, 412, 768 and 1280 px) and check light and dark themes.
- Headless Playwright only; never open a visible browser or steal focus.
- Commit a short docs/qa note listing what was checked.
## Notes for AI
Screenshot attached shows the current mobile header and Mission Control. Do not touch repoos.toml. Follow AGENTS.md conventions (full-width pages, no native title tooltips). This is a small UI fix; keep it to these three items.

## Shots
```json
[
{
"label": "Work is the home page; header row controls share one height",
"target": "default",
"route": "/work",
"highlight": ".topbar"
}
]
```

## Screenshots

![Mobile Mission Control: scrollbar on the right, tall repo chip](/api/tasks/1258/attachments/att_ec508aac-926b-4ad8-8020-060dbcfc4ca0.png)

## Activity

- 2026-11-20T00:15:33Z · created · t@t
- 2026-11-20T00:15:36Z · screenshots
- 2026-11-20T00:15:56Z · status inbox→ready
- 2026-11-20T00:16:00Z · cli_override, model_override
- 2026-11-20T00:16:03Z · status ready→active, branch
- 2026-11-20T00:17:11Z · note: adopted orphaned engineer pid 86874
- 2026-11-20T00:33:31Z · body
- 2026-11-20T00:36:54Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-20T00:36:58Z · status active→review
- 2026-11-20T00:36:59Z · message_queued at 2026-11-20T00:36:59.082Z
- 2026-11-20T00:39:21Z · note: review pass 1: good to go
- 2026-11-20T01:40:38Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T08:06:53Z · status review→active
- 2026-11-20T08:06:58Z · message_queued at 2026-11-20T08:06:58.117Z
- 2026-11-20T08:10:05Z · message_delivered: 1 message(s)
- 2026-11-20T08:12:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:22:19Z · queued message undelivered for 15m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T08:22:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The #1258 implementation was already on the branch and the review passed, so this session only verified it and prepared the handoff. The scoped check is still running in the background, so I have not emitted the handoff signal yet. **What … · stderr: (empty)
- 2026-11-20T08:22:23Z · note: handoff requested (cli)
- 2026-11-20T08:22:31Z · CTO nudge: held — handoff gate is running
- 2026-11-20T08:26:31Z · message_delivered: 1 message(s)
- 2026-11-20T08:27:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I've stopped short of the handoff. The two target tests and the other header tests pass, but the change isn't ready to hand off. **What I fixed** - `src/core/shot-targets.ts`: added `/control` to `APP_ROUTE_PREFIXES`. It's the route that M… · stderr: (empty)
- 2026-11-20T08:27:29Z · status active→review
- 2026-11-20T08:34:52Z · message_queued at 2026-11-20T08:34:52.007Z
- 2026-11-20T08:34:52Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/mobile-touch-affordances.test.ts > mobile web polish (#1139) > gives top-bar controls a 44px touch target and keeps the project name visible, tests/mobile-touch-affordances.test.ts > mobile web polish (#1139) > turns search into a compact accessible icon button on phones, tests/shot-target-support-0866.test.ts > app target resolution (#0866) > keeps APP_ROUTE_PREFIXES in sync with the UI router on mini — fix it in the feature branch and re-run the gate
- 2026-11-20T08:34:53Z · note: review pass 2: needs some work
- 2026-11-20T08:34:53Z · message_delivered: 1 message(s)
- 2026-11-20T08:34:54Z · status review→active
- 2026-11-20T08:46:47Z · CTO nudge: held — handoff gate is running
- 2026-11-20T08:54:35Z · handoff failed · remote validation failed: test failure: tests/live-reconnect-qa-browser.test.ts > Control dashboard live recovery at 375/768/1280 (WebKit, fixtures) > reconnects, catches up, and clears the pill at 375px without a reload, tests/live-reconnect-qa-browser.test.ts > Control dashboard live recovery at 375/768/1280 (WebKit, fixtures) > reconnects, catches up, and clears the pill at 768px without a reload, tests/live-reconnect-qa-browser.test.ts > Control dashboard live recovery at 375/768/1280 (WebKit, fixtures) > reconnects, catches up, and clears the pill at 1280px without a reload on mini — fix it in the feature branch and re-run the gate
- 2026-11-20T08:54:36Z · message_queued at 2026-11-20T08:54:36.589Z
- 2026-11-20T08:57:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:57:39Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T08:57:40Z · message_delivered: 1 message(s)
- 2026-11-20T09:26:28Z · body
- 2026-11-20T09:29:36Z · status active→review
- 2026-11-20T09:49:07Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Work is the home page; header row controls share one height (target "default"): loading state detected: loading indicator [aria-busy="true"] on /work (http://127.0.0.1:34337/work)
- 2026-11-20T09:49:07Z · message_queued at 2026-11-20T09:49:07.962Z
- 2026-11-20T09:49:08Z · note: review pass 3: needs some work
- 2026-11-20T09:49:09Z · status review→active
- 2026-11-20T09:49:10Z · message_queued at 2026-11-20T09:49:10.963Z
- 2026-11-20T09:49:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T09:54:15Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: test failure: tests/mobile-touch-affordances.test.ts > mobile web polish (#1139) > gives top-bar controls a 44px touch target and keeps the project name visible, tests/mobile-touch-affordances.test.ts > mobile web polish (#1139) > turns search into a compact accessible icon button on phones, tests/shot-target-support-0866.test.ts > app target resolution (#0866) > keeps APP_ROUTE_PREFIXES in sync with the UI router on mini — fix it in the feature branch and re-run the gate · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass

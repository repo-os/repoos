---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task 1252 was a QA pass over error pages, 404 routes and deep links to tasks, tabs and settings. It found two real defects: unknown URLs silently redirected to the dashboard, and an unknown `?task=` id failed silently on the desktop Work page (the phone layout already had a fallback). Both were fixed with a friendly not-found view and a persistent "task isn't on the board" notice, covered by a route-table test and a headless WebKit layout test at 375/768/1280 px. The QA write-up is in `docs/qa/2026-11-deep-links-404-qa.md`, with code-read rows clearly labelled where a browser was not driven. One engineering round, one review pass (`good to go`), clean close-out, done and released.

## Outcome

Shipped:

- A named `not-found` route replacing the catch-all `redirect: "/"`, backed by `NotFoundView.vue`. Bad links now show a plain-English "This page doesn't exist" view inside the app shell, showing the requested path, with "Go to Work" and "Dashboard" ways back. The auth guard still runs first, so signed-out visitors land on `/login?redirect=…` as before.
- A desktop fallback on the Work page: an unknown `?task=` id now shows a "This task isn't on the board" notice with a Back to Work control that clears the param. The new `missingTaskId` state is set only when the request token still matches (no stale overwrites) and clears on param removal, new lookups and successful opens. The phone layout's existing "Task unavailable" shell is unchanged.
- A small shared `RouteNotice.vue` component (title, explanation, actions slot) with global `.route-notice*` styles in `style.css` — deliberately unscoped so the headless WebKit test renders the real shipped markup and stylesheet.
- Tests: `router-not-found.test.ts` (unknown paths resolve to `not-found`, real routes including `/tasks/:id/diff` still resolve) and `deep-links-404-qa-browser.test.ts` (fixture-only headless WebKit at 375/768/1280 px: no viewport overflow, way-back controls visible, expected copy present).
- `docs/qa/2026-11-deep-links-404-qa.md`, recording which rows were browser-verified and which were confirmed by reading code.

Verified as already correct, no change needed: archived tasks open their drawer normally (archived ids stay in `repo.tasks`), unknown tab ids fall back to the drawer default, and Settings falls back to General for unknown tabs and ignores unknown sections.

Reviewer verdict: **good to go**. The task closed as **done** with `release:success`, merged as commit `c5c12bc8bad5028fbd92f2eb4e15efcd2fe69b4f`.

## Process stats

- **Engineering rounds:** 1 (round 1 at 2026-11-19T23:19:21Z, Claude Code, model `haiku`). No restarts or model swaps recorded.
- **Review rounds:** 1 (pass 1 at 2026-11-19T23:21:22Z, verdict `good to go`, opencode, model `opencode-go/glm-5.3-flash`).
- **Agents and models per role:**
- engineer — `haiku` via Claude Code; session 2199 s, 34,862 tokens, cost $0.15855831.
- reviewer — `opencode-go/glm-5.3-flash`; session 116 s, 47,972 tokens, cost $0.02092443.
- routing — Model router (jev), 0 s, tokens/cost not recorded.
- **Totals (engineer + reviewer, where recorded):** 82,834 tokens, $0.17948274.
- **Wall-clock, created → done:** 2026-11-19T22:27:09Z → 2026-11-20T01:05:17Z, about 2 h 38 m.
- **Close-out gate:** completed in 1077 s (finished 2026-11-20T01:04:28Z).

## What went wrong

- **Handoff gate stall (resolved).** At 23:07:46Z the CTO nudged that the task was held while the handoff gate was running. It cleared on its own: review pass 1 returned `good to go` at 23:21:22Z and the task moved to review.
- **Queued message never delivered (unresolved, non-blocking).** A message queued at 23:19:23Z was flagged overdue at 00:27:11Z ("still queued after 60m without being delivered"). It did not prevent close-out; no further activity was recorded for it.
- **11 failing tests across 8 files in a full UI-project vitest run** (agent-review, branch-artifact-guard, check-timing-recording, cli-control-api, engineer-resources, models, runtime, shot-capture-single). None touches the changed code; rerunning just those files reproduced the failures. The engineer judged them environmental (temp-directory `ENOTEMPTY`, missing opencode binary, Bun re-exec, Node module resolution) but did **not** verify they fail on main, so this is unconfirmed. The UI-only tests, including the existing 375 px browser suites, passed, and the engineer ran the UI vitest project directly because the scoped check had marked the test step as skipped (reported as run on the remote validation runner).
- **One flaky 375 px timing assertion** failed under load earlier in the run and passed on the next run.
- **Tooling friction (resolved in-session):** the root `vitest` binary without `--config` cannot parse `.vue` imports, and the UI project's `vite.config.ts` runs the whole suite, not just `src/ui-app/tests`. Working invocation: `bunx vitest run --config src/ui-app/vite.config.ts`. The browser suite also needs `dist/ui/assets` built (`bun run build:ui`) and Playwright's WebKit beforehand.
- The scoped check itself (`REPOOS_CHECK_CHANGED=main repoos check`) passed: format, lint, build, CSS layering, theme and hard-coded-colour guards, the rendered contrast audit and the UI smoke test.

## Learnings

- **A silent redirect is a UX bug.** The catch-all `redirect: "/"` hid every mistyped URL; the only cue was the page changing. A named not-found route costs one component and one test. Durable enough for `AGENTS.md` or `docs/agent-ui-and-preview-conventions.md`: unknown routes must render an explicit not-found view, never redirect.
- **Desktop and phone fallbacks must match.** The phone layout already had a "Task unavailable" shell; the desktop path silently did nothing. Checking both layouts for every deep-link case is the cheapest way to catch this class of gap.
- **Global styles for shared notice components make headless layout checks honest.** Scoped styles would need a compile step inside the test; global rules let WebKit render exactly what ships.
- **Test tooling note worth recording in `docs/`:** UI vitest runs need `bunx vitest run --config src/ui-app/vite.config.ts`; bare `vitest` fails on `.vue` imports. Also, a full UI-project run currently carries ~11 environmental failures in 8 unrelated files — worth a follow-up investigation so the signal stays clean.
- **A persistent in-page notice beats a toast for shared-link failures** — toasts disappear before the person opening a shared link reads them, and keeping the failed param in the URL keeps the bad link inspectable.

## Follow-ups

New tasks filed as a result of this task: **none** (Linked tasks records none). Unfiled suggestions the reviewer left on the record, for whoever drives the board next:

- `/tasks/<unknown-id>/diff` renders an empty diff with no message (a pre-existing sibling of the same silent-fallback class, untouched by this diff) — give `DiffView` an unknown-task message, reusing `RouteNotice`.
- Declare shots on the next UI task that needs these states, e.g. `route: /no-such-page` and `route: /work?task=9999` on the `default` app target.
- Open items for a human, recorded in the QA doc: a live logged-in click-through of the drawer for deleted, archived and wrong-tab links, and a phone touch-target check on hardware, were not run here.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

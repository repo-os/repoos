---
id: "0950"
title: "Fast, consistent page loads: show the page shell and a skeleton loader instead of a blank wait on Releases, Checks, Deployments, Dev and similar pages"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/fast-consistent-page-loads-show-the-page
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-24T16:13:34Z"
updated_at: "2026-10-24T23:06:18Z"
review_passes: 4
handoff_signal_retry_count: 2
review_rounds: 2
last_check_failure: "repoos check at 2026-10-24T16:55:14.081Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Deployments first load skeleton (target \"default\"): loading state detected: loading indicator [aria-busy=\"true\"] on /deployments (http://127.0.0.1:39677/deployments?shotState=deployments%3Aloading); [missing-target] Dev first load skeleton (target \"default\"): loading state detected: loading indicator [aria-busy=\"true\"] on /dev (http://127.0.0.1:39677/dev?shotState=dev%3Aloading)"
engineer_stall_resume_log: "[{\"at\":\"2026-10-24T23:04:41.799Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem

Several pages (Releases, Checks, Deployments, Dev on first load, and likely Secrets/Agents) take a few seconds to show their content every time the user navigates to them, even when they were open seconds earlier. Each view keeps its data in component-local state (`const loading = ref(true)` + a fetch in `onMounted`), so leaving the page throws the data away and coming back starts from nothing. While waiting the page shows either a bare spinner (`<div class="spin">` on Releases and Deployments), a text line ("Loading the check plan…", "Loading dev targets…"), or nothing, so the loading experience is inconsistent, and the page title and fixed text are not rendered until the data arrives. Rough timing of the data calls through the CLI: `/api/deployments` about 1.2s, `/api/dev/targets` about 0.6s, `/api/check-plan` and `/api/releases` about 0.35s each, and several pages make more than one call, so the waits add up. Measure the real per-endpoint and per-page times first; do not assume.

## Desired UX

1. The page shell (title, description, tabs, fixed labels, buttons, layout) renders immediately, always, before any data arrives.
2. While data is loading for the first time, show a realistic skeleton loader shaped like the real content (cards, rows, tables), not a spinner or a text line. One shared skeleton component/primitive used by every page, so loading looks the same everywhere. Respect prefers-reduced-motion.
3. Navigating away and back within a short window shows the previously loaded data instantly (stale-while-revalidate): render the cached data at once and refresh quietly in the background, updating in place without flashing a skeleton. Only pages with genuinely time-sensitive data (running dev targets, running checks) need a visible refresh, and a silent refresh is fine for those too.
4. A refresh that is already in flight must not be duplicated by navigation, and a failed background refresh must keep the stale data visible with a small non-blocking error state, not blank the page.
5. Data that did not change should not cause visible reflow when the refresh lands.

## Acceptance criteria

- [ ] A measured baseline (per-page time to content, per-endpoint latency) is recorded in the task notes before and after the change.
- [ ] Releases, Checks, Deployments, Dev, Secrets and Agents all render their page shell immediately; none shows a bare blank area, a lone spinner, or only a text line while loading.
- [ ] One shared skeleton loader (component or composable) is used by all of them, with skeleton shapes that match each page's real layout, and it respects reduced motion.
- [ ] Revisiting a page within the cache window shows cached content immediately (no skeleton) and refreshes in the background; the cache is invalidated when the page performs a mutating action (start/stop, deploy, release).
- [ ] A background refresh failure keeps stale content visible and shows a non-blocking error.
- [ ] Slow server endpoints found during measurement (for example `/api/deployments`) are noted, and any easy server-side win (parallelising independent work, avoiding repeated git/exec calls) is made or filed as a follow-up with numbers.
- [ ] Tests: skeleton shows on first load and not on revisit, cached-then-refresh behavior, refresh failure keeps data, no duplicate in-flight request.
- [ ] Declare `## Shots` showing the skeleton state and the loaded state of at least Deployments and Dev (use routes or state fixtures; look at them yourself and judge whether the skeleton resembles the real page).
- [ ] Follow AGENTS.md UI conventions (shared dialog/form classes, theme tokens, no hard-coded colors, no native title tooltips); check docs/user-docs for any loading-state description that changes.

## Notes for AI

- Prefer a small shared data-cache layer (a Pinia store or composable keyed by endpoint) over per-view copies of the same logic; migrate the listed views onto it.
- Do not add runtime dependencies. Do not change what the endpoints return.
- Pages that already use a store with cached data (Work board, Inputs) are the model for how revisits should feel.
- Run every test touching the migrated views in small groups, and `repoos check --changed main`, before handoff.

## Shots
```json
[
{
"label": "Deployments first load skeleton",
"target": "default",
"route": "/deployments",
"highlight": ".page-skeleton",
"state": "deployments:loading"
},
{
"label": "Deployments loaded view",
"target": "default",
"route": "/deployments",
"highlight": ".dep-page",
"state": "deployments:environmentBinding"
},
{
"label": "Dev first load skeleton",
"target": "default",
"route": "/dev",
"highlight": ".page-skeleton",
"state": "dev:loading"
},
{
"label": "Dev running target",
"target": "default",
"route": "/dev",
"highlight": ".dev-card",
"state": "dev:running"
}
]
```

## Activity

- 2026-10-24T16:13:34Z · created · njachowski@gmail.com
- 2026-10-24T16:14:18Z · status inbox→ready
- 2026-10-24T16:14:26Z · cli_override, model_override
- 2026-10-24T16:14:27Z · status ready→active, branch
- 2026-10-24T16:15:55Z · body
- 2026-10-24T16:16:21Z · body
- 2026-10-24T16:18:29Z · body
- 2026-10-24T16:20:15Z · body
- 2026-10-24T16:21:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T16:37:14Z · note: ui verification failed: ui verification failed (2 issue(s)): [missing-target] Deployments first load skeleton (target "default"): highlight .page-skeleton matched nothing on /deployments (http://127.0.0.1:43579/deployments); [missing-target] Dev first load skeleton (target "default"): highlight .page-skeleton matched nothing on /dev (http://127.0.0.1:43579/dev)
- 2026-10-24T16:38:12Z · body
- 2026-10-24T16:40:01Z · body
- 2026-10-24T16:42:33Z · body
- 2026-10-24T16:55:07Z · note: ui verification failed: ui verification failed (2 issue(s)): [missing-target] Deployments first load skeleton (target "default"): loading state detected: loading indicator [aria-busy="true"] on /deployments (http://127.0.0.1:39677/deployments?shotState=deployments%3Aloading); [missing-target] Dev first load skeleton (target "default"): loading state detected: loading indicator [aria-busy="true"] on /dev (http://127.0.0.1:39677/dev?shotState=dev%3Aloading)
- 2026-10-24T16:57:14Z · body
- 2026-10-24T17:08:26Z · note: ui verification passed: 4 of 4 shots captured with clean console
- 2026-10-24T17:08:27Z · status active→review
- 2026-10-24T17:09:44Z · note: review pass 1: needs some work
- 2026-10-24T17:09:45Z · status review→active
- 2026-10-24T17:09:47Z · CTO nudge: held — remote validation is running
- 2026-10-24T17:13:21Z · note: Performance evidence for review round 2: the task description supplies rough pre-change endpoint estimates (not measurements from this run): /api/deployments ~1.2s, /api/dev/targets ~0.6s, /api/check-plan and /api/releases ~0.35s each; per-page time-to-content was not recorded. No post-change live endpoint or page timing was collected in this run, so no before/after improvement is claimed. Deployments now requests deployments and project-environments in parallel; this removes serial waiting, but no numerical speedup is asserted. Follow-up: capture repeatable per-endpoint and per-page timings against the managed preview before marking the measurement acceptance criterion complete. --help
- 2026-10-24T17:15:05Z · body
- 2026-10-24T17:26:19Z · note: ui verification passed: 4 of 4 shots captured with clean console
- 2026-10-24T17:26:20Z · status active→review
- 2026-10-24T17:27:22Z · note: review pass 2: needs some work
- 2026-10-24T17:27:23Z · status review→active
- 2026-10-24T17:27:25Z · CTO nudge: held — remote validation is running
- 2026-10-24T17:31:09Z · body
- 2026-10-24T17:36:53Z · message_queued at 2026-10-24T17:36:52.998Z
- 2026-10-24T17:36:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-24T17:37:03Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-24T17:37:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T17:37:03Z · message_delivered: 1 message(s)
- 2026-10-24T17:37:24Z · status active→review
- 2026-10-24T17:39:23Z · note: review pass 3: needs some work
- 2026-10-24T17:39:23Z · needs_input
- 2026-10-24T17:49:07Z · note: ui verification passed: 4 of 4 shots captured with clean console
- 2026-10-24T22:18:25Z · status review→active
- 2026-10-24T22:18:37Z · needs_input
- 2026-10-24T22:18:37Z · message_queued at 2026-10-24T22:18:37.928Z
- 2026-10-24T22:19:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T22:19:01Z · status active→review
- 2026-10-24T22:19:02Z · message_delivered: 1 message(s)
- 2026-10-24T22:19:02Z · note: handoff requested (cli)
- 2026-10-24T22:21:20Z · note: ui verification passed: 4 of 4 shots captured with clean console
- 2026-10-24T22:21:20Z · status active→review
- 2026-10-24T22:22:14Z · note: review pass 4: needs some work
- 2026-10-24T22:22:14Z · needs_input
- 2026-10-24T22:39:32Z · status review→active
- 2026-10-24T22:39:32Z · note: send-back — returned to active for engineer follow-up
- 2026-10-24T22:39:34Z · needs_input
- 2026-10-24T22:39:34Z · message_queued at 2026-10-24T22:39:34.591Z
- 2026-10-24T22:39:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-24T22:40:04Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T22:40:04Z · message_delivered: 1 message(s)
- 2026-10-24T22:46:19Z · body
- 2026-10-24T22:48:16Z · body
- 2026-10-24T22:50:57Z · body
- 2026-10-24T22:52:50Z · body
- 2026-10-24T22:59:01Z · note: Final committed tree a67cdc873e25: merge of main resolved; scoped check passes. I visually inspected Deployments first-load skeleton and populated matrix, plus Dev first-load skeleton and loaded stopped-target cards in the managed preview. The local repoos shot capture stalled before writing artifacts. I did not obtain valid 5-run before/after endpoint or per-page medians this turn; the description's rough pre-change estimates are not measurements, and no timing improvement is claimed. Performance acceptance remains open; no deployment endpoint root-cause or follow-up task is asserted without measurements.
- 2026-10-24T22:59:40Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T23:04:41Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-24T23:06:18Z · body

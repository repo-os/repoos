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
updated_at: "2026-10-24T16:37:14Z"
handoff_signal_retry_count: 1
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
"highlight": ".page-skeleton"
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
"highlight": ".page-skeleton"
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

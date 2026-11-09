---
id: "1078"
title: "Per-view skeletons: apply the show-delay and minimum-visible-time gate in every view that renders its own PageSkeleton (follow-up to #1070)"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T09:38:37Z"
updated_at: "2026-11-09T09:38:37Z"
---
## Problem
#1070 added a show-delay (about 180 ms) and minimum visible time (about 350 ms) for the shell-level first-load skeleton in App.vue. Views that render their own `PageSkeleton` while their data loads (Checks, Agents, Releases, Deployments, Dev, Secrets, Settings) still show it immediately and can flash it for a few milliseconds.

## Desired UX
Every first-load skeleton in the app follows the same rule: nothing for fast loads, then a placeholder that stays long enough not to flash. Implemented once in the shared component, not per view.

## Acceptance criteria
1. A shared composable or `PageSkeleton` prop applies the delay and minimum time (fake-timer tests: fast load shows nothing, slow load shows it for at least the minimum, cached data shows none).
2. Each view listed above uses it; no view re-implements timing.
3. No layout shift when the content replaces the skeleton; reduced-motion honoured.

## Notes for AI
See App.vue (showRepoSkeleton), `PageSkeleton.vue`, `src/ui-app/tests/app-loading-skeleton.test.ts` and the review reports under work/reports/1070/. Do not edit repoos.toml.

## Activity

- 2026-11-09T09:38:37Z · created · njachowski@gmail.com

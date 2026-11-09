---
id: "1078"
title: "Per-view skeletons: apply the show-delay and minimum-visible-time gate in every view that renders its own PageSkeleton (follow-up to #1070)"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T09:38:37Z"
updated_at: "2026-11-09T12:59:00Z"
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

## More items moved here from #1070 (review pass 5)
From review 5 of #1070, accepted as follow-up and NOT blocking #1070: (a) board skeleton columns should match the real board's responsive breakpoints (real .board becomes 3 columns at <=1250px, style.css ~2073; the skeleton keeps six until 760px); (b) PageSkeleton should reuse the existing motion settings (activityAnimationConcurrency, page-visibility and IntersectionObserver gating from useActivityMotion, as ActivityIndicator.vue does) instead of an unconditional pulse; (c) cache seeding: views other than SecretsView (Checks, Releases, Deployments, Dev, Agents, CheckRuns) can still draw the skeleton on a revisit within five minutes because their local refs start empty; (d) Mission Control's real page is a usage panel plus a resources panel, so a closer skeleton shape is a later refinement.

## Activity

- 2026-11-09T09:38:37Z · created · njachowski@gmail.com
- 2026-11-09T12:59:00Z · body: More items moved here from #1070 (review pass 5) (added)

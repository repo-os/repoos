---
id: "0622"
title: Promote release failures above published-to and show loading state
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/promote-release-failures-above-published
created_at: "2026-10-02T01:48:25Z"
updated_at: "2026-10-02T02:44:33Z"
review_passes: 3
review_rounds: 2
---
## Problem

The release failure UI exists and is useful, but it sits below the fold so users may not see that a release failed. When a failure has occurred, that information should be visible without scrolling past other release content.

The “published to” block also appears empty for several seconds while its data loads, with no indication that content is still loading, which reads as broken or missing rather than in progress.

## Desired UX

When the most recent release attempt for the relevant context failed—and until a subsequent release succeeds—the release failure section appears **above** the “published to” section so it is immediately visible in the default viewport.

After a successful release, the failure section returns to its normal placement (or is hidden/cleared per existing product rules); it does not stay promoted once the failure is resolved by a successful release.

While “published to” data is loading, show a clear loading indicator (animation or equivalent) in that area so users know content is on the way. When data arrives, replace the loading state with the existing published-to content; on error, follow existing error handling if any.

## Acceptance criteria

- [ ] After a release failure and before the next successful release, the release failure section renders above the “published to” section in the releases UI.
- [ ] After a successful release following a failure, the promoted placement no longer applies (failure UI follows normal post-success behavior).
- [ ] While “published to” is fetching or resolving, a visible loading animation (or consistent loading pattern used elsewhere in the app) is shown in that section.
- [ ] When “published to” data loads successfully, the loading state is removed and the current published-to content displays as today.
- [ ] No regression: release failure details and published-to content remain accurate when both are shown.

## Notes for AI

- Scope is layout/order and loading feedback only; do not change release provider APIs or failure detection logic unless required to know “failed until next success.”
- **Assumption:** “Until the next successful release” means promote the failure block from the last failed attempt until a later attempt completes successfully for the same release context (repo/task/release record the UI already uses).
- **Assumption:** Loading state applies only to the “published to” section’s async load, not the entire releases page, unless the same data gate controls both.
- Reuse existing release failure and published-to components; prefer shared loading patterns from `src/ui-app` over one-off spinners.
- Do not auto-request previews; declare `## Shots` at handoff if UI layout changes materially.
- Touch likely: releases-related view(s) under `src/ui-app/src/views/` and any child components that render failure vs published-to blocks—confirm paths in implementation.

## Scope

- In: conditional reorder (failure above published-to), loading UI for published-to.
- Out: redesign of release failure copy, new release providers, or changing what constitutes a failure server-side.

## Original prompt

I just noticed this nice release failure section, but it's hidden below the fold, if there's been a release failure show it above the "published to" section until the next successful release. Also since the "published to" content seems to take a few seconds to load please add a loading animation there so the user knows something is happening.

## Screenshots

![Screenshot-2026-10-02-at-09.46.27](/api/tasks/0622/attachments/screenshot-1.png)
![Screenshot-2026-10-02-at-09.46.06](/api/tasks/0622/attachments/screenshot-2.png)

## Shots
[{"target": "default", "route": "/releases", "label": "Failure promoted above Published to with loading indicator behavior fixed (#0622 review fix: retry poll race)"}]

## Activity

- 2026-10-02T01:48:25Z · created · hello@repoos.org
- 2026-10-02T01:48:26Z · screenshots
- 2026-10-02T01:48:26Z · screenshots
- 2026-10-02T01:48:42Z · status draft→inbox, title, area, body
- 2026-10-02T01:53:31Z · status inbox→ready
- 2026-10-02T01:53:44Z · status ready→active, branch
- 2026-10-02T02:03:44Z · body: section Shots
- 2026-10-02T02:08:21Z · status active→review
- 2026-10-02T02:09:10Z · status review→active
- 2026-10-02T02:16:16Z · status active→review
- 2026-10-02T02:16:16Z · note: shots: skipped — 1 shot already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-02T02:17:32Z · status review→active
- 2026-10-02T02:21:47Z · status active→review
- 2026-10-02T02:21:47Z · note: shots: skipped — 1 shot already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-02T02:23:20Z · needs_input
- 2026-10-02T02:31:23Z · status review→active
- 2026-10-02T02:33:26Z · needs_input (review-rounds-exhausted) dismissed by hello@repoos.org
- 2026-10-02T02:44:33Z · body: section Shots

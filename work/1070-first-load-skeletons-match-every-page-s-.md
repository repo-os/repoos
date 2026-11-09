---
id: "1070"
title: "First-load skeletons: match every page's real layout (Control and Stories are off), audit all pages"
type: bug
status: review
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/first-load-skeletons-match-every-page-s-
created_at: "2026-11-09T03:37:29Z"
updated_at: "2026-11-09T06:09:10Z"
---
## Problem
First-load skeletons are jarring and in places wrong. On Mission Control (`/`) the `dashboard` skeleton draws six tall cards in an `auto-fit` grid (`PageSkeleton.vue`), so on a wide window they wrap into one row of four plus a stray card on a second row, and none of it resembles the real page (which is not a board of cards like Work and Inputs). Stories shows the same kind of mismatch. Other pages use `board`, `inputBoard`, `cards`, `table`, `rows`, `targets` and `deployments` shapes picked by route in `src/ui-app/src/lib/loading-skeleton.ts`, and nobody has checked each one against its real content.

## Desired UX
A first load should feel calm and predictable: the skeleton is the same shape as the page that replaces it, so nothing jumps when data arrives. Follow modern practice:
- Skeleton mirrors the real layout (same header, same grid, same row heights, same column count at the same breakpoints) and is only a placeholder for the data parts. Static chrome (page title, subtitle, tabs, buttons) renders immediately and is never skeletonised.
- One row or one realistic block is better than a fake full page; never draw more placeholders than the real page would show at that width (derive the count from the same constants/breakpoints as the real content, not a hard-coded number).
- Delay showing the skeleton by about 150-250 ms so fast loads show nothing, and once shown keep it for a minimum of about 300-400 ms so it does not flash. No skeleton at all when cached data exists (stale-while-revalidate); background refreshes never bring a skeleton back.
- Subtle motion only: a slow, low-contrast shimmer or pulse, honouring `prefers-reduced-motion` (static placeholder) and the existing animation settings; never a busy or fast animation.
- Content cross-fades in; no layout shift. Accessible: a single `aria-busy` region with a polite label, not dozens of announced elements.

## Acceptance criteria
1. Fix Mission Control (`/`) and Stories now: each skeleton matches its real page layout, in a single block/row where the real page is a single block/row, with no stray second row at wide, medium and narrow widths.
2. Audit every route listed in `LOADING_SKELETON_ROUTES` plus the per-view `PageSkeleton` uses (Checks, Agents, Releases, Deployments, Dev, Secrets, Settings, Work, Inputs): for each, record the real layout vs the skeleton in a short table in the task report and fix the mismatches. Where a page has no sensible skeleton shape, prefer a minimal one over a wrong one.
3. Placeholder counts and sizes come from the same constants as the real content (for example column counts), not magic numbers.
4. Show-delay and minimum-visible-time behaviour is implemented once (in `PageSkeleton`/the shell), not per view, with tests (fake timers): fast load shows no skeleton; slow load shows it for at least the minimum time; cached data shows none.
5. Reduced motion: no animation; tests assert it. A test per skeleton kind asserts the item count against the real layout constants.
6. Declared shots (`repoos update <id> --shots`) show the loading state of Mission Control and Stories after the fix (use a state fixture, not click steps).
7. Anything too big for this task (for example a full redesign of the dashboard page itself) is filed as a follow-up, not folded in.

## Notes for AI
Files: `src/ui-app/src/components/PageSkeleton.vue`, `src/ui-app/src/lib/loading-skeleton.ts`, `src/ui-app/src/App.vue` (the shell-level skeleton, line ~171), `DashboardView.vue`, `StoriesView.vue`, and the `PageSkeleton` call sites in the other views. Reuse the existing animation settings (see `ActivityIndicator.vue`) rather than inventing new motion settings. No native `title` tooltips; custom dialogs only. Do not edit repoos.toml. Rebuild the UI (`bun run build:ui`) after changes.

## Screenshots

![Mission Control first load: 4 tall skeleton cards plus 1 wrapped onto a second row, nothing like the real page](/api/tasks/1070/attachments/att_a8a74fca-9dad-4cb2-bb73-bf85bfff1f4b.webp)

## Activity

- 2026-11-09T03:37:29Z · created · njachowski@gmail.com
- 2026-11-09T03:37:30Z · screenshots
- 2026-11-09T03:54:56Z · status inbox→ready
- 2026-11-09T03:56:06Z · status ready→active, branch
- 2026-11-09T06:09:10Z · status active→review

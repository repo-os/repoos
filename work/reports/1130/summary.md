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

Task #1130 fixed a p0 mobile-web bug where the Work page rendered the mobile task queue and the desktop board simultaneously, with the board painting over the mobile cards. Root cause was a Vue `v-else` chained to `MobileTaskDetail` instead of the narrow-layout branch, so "no task selected" also meant "render the desktop board". One engineer round restructured the conditional so only one layout mounts below the mobile breakpoint, hoisted the integration pipeline bar out of the desktop-only branch, and added a phone-width regression test. One review pass returned `good to go`; the task closed out cleanly with release success. No live phone or v0.5.87 server was available, so reproduction relied on component tests at 360/390/412px; main was confirmed affected by source inspection.

## Outcome

On a phone (about 412px wide, Nick's Nothing Phone 3a, server v0.5.83), the Work page drew both the mobile "Work queue" composition and the desktop board at once, with the board covering the lower half of the mobile list, disagreeing filter counts (mobile header "1 task" vs board Inbox (17) / Done (99)), and the integration pipeline bar floating over content. The page was effectively unusable on a phone.

The shipped fix:

- **Single layout on narrow viewports.** `WorkView.vue` now wraps the narrow composition in its own `<template v-if="isNarrow">` with the desktop `v-else` chained to that template, so the desktop board is unmounted (not `display:none`) below the breakpoint. The mobile queue stays mounted with `v-show` while the task detail is open so filter/sort state survives Back.
- **Integration pipeline bar preserved on mobile.** `<IntegrationStatusBar>` was hoisted out of `.work-page` to the view root, so hiding the desktop branch no longer removes pipeline status on a phone.
- **Bottom clearance simplified.** The queue's hand-tuned 120px bottom spacer was trimmed to 16px; the shared `--page-bottom-inset` on the scroller is what clears the fixed tab bar, verified by a WebKit geometry test.
- **Consistent filter/count.** The mobile header count and visible list already read one computed array; with the board gone, they agree by construction. The mobile status filter was deliberately left session-local rather than synced to `?status=`.
- **Mobile "Move to done".** The task detail gained the missing primary action for review tasks, gated on `repo.landableFor(id).landable` (the same read-only landing pre-checks the desktop drawer uses), with disabled/loading/failure states and inline error surfacing.
- **Touch targets.** Queue status, sort and reset controls raised from 40px to 44px.

Regression coverage: a parameterized test mounts the real `WorkView` with a narrow `matchMedia` stub at 360, 390 and 412px and asserts only `[data-testid="mobile-work-queue"]` is present — before the fix it found both the mobile queue and `.work-page` at all three widths, and this failing pre-fix run is the recorded reproduction.

**Reproduction caveat (documented in the task):** no live v0.5.87 server or real phone was available in the agent run, so the bug was not observed on a live build or device; the phone screenshots came from the older v0.5.83. The HEAD source contained the identical `v-else` chain, so main was affected too. Desktop layout at 1280px is covered by a declared shot.

**Final verdict:** review pass 1 returned `good to go`; the task closed out successfully (`release:success`), merged as commit `075fe9ac9ca09d5b5bd1954ab988cf22e37d7f87`.

## Process stats

- **Timeline:** created 2026-11-15T14:34:55Z → done 2026-11-15T16:20:45Z — **1h 45m 50s** wall-clock from start to done.
- **Engineering rounds:** 1 (round 1, 2026-11-15T15:25:13Z, plus one resumed turn to read queued messages).
- **Review rounds:** 1 (pass 1, 2026-11-15T15:26:51Z, verdict `good to go`).
- **Agents and models:**
- Engineer: `opencode-go/deepseek-v4.1-flash` — session elapsed 2759s (~46m), **181,278 tokens**, cost **$0.116830842**.
- Reviewer: `composer-2.5` — session elapsed 93s; tokens and cost not recorded.
- Model routing (openrouter router): two 1s sessions, model `unknown`; tokens and cost not recorded.
- **Restarts or model swaps:** none recorded. One engineer *resume* occurred (the first turn ended cleanly without requesting handoff; see below), not a restart.
- **Close-out:** gate completed in 114s; automated verification passed (browser console-error check on handoff evidence; guard negative-test evidence skipped — no check guard rules materially changed).

## What went wrong

- **Engineer turn ended without a handoff** (2026-11-15T15:15:47Z): the turn exited cleanly with code 0 after the scoped check passed, but did not request review, and 1 queued message still had to be read before review (`handoff_deferred`). RepoOS resumed the engineer to read the queued messages (2 delivered at 15:15:59Z); the handoff then completed normally. Resolution: automatic resume — no manual intervention recorded.
- **CTO nudge held at the handoff gate** (2026-11-15T15:24:06Z): a nudge arrived while the handoff gate was still running. It resolved itself when handoff completed and the task moved to review at 15:25:13Z.
- **Task-body lint note:** on entering review, "Task body is underspecified: missing sections: Notes for AI". Recorded as a note; it did not block the review verdict.
- **No live device or live server:** the acceptance criteria called for reproducing on the current main build at 360/390/412px, but no v0.5.87 server or real phone was available in the run. The engineer reproduced via mounted-component tests with a narrow `matchMedia` stub and confirmed from source that main had the same defect; the reviewer accepted this as a documented evidence gap rather than a blocker.
- **Vitest hangs under Node 26** when the repo's `globalSetup` (process-reap) is enabled; the same config runs normally under Bun. The engineer ran the focused suites via `bun node_modules/.bin/vitest run …`, matching the runtime `repoos check` uses. Environment/runtime difference, not a test failure.
- **One queued message dropped at close-out** (16:20:17Z): 1 queued message was discarded because the task was already done. Normal lifecycle behavior, no action needed.

## Learnings

- **`v-else` binds to the immediately preceding `v-if`/`v-else-if` sibling, not to a logical "group".** Chaining it across a conditional detail view silently turned "no task selected" into "render the desktop board". A `<template v-if>` wrapper makes the branch structure explicit. Worth a line in `docs/agent-ui-and-preview-conventions.md` alongside the existing Vue layout conventions.
- **Layout regression tests should mount the real view at the reported widths and assert which composition exists in the DOM.** Asserting only `isNarrow === true` would have passed while the bug remained. The parameterized 360/390/412px pattern here is the template to copy for future "two layouts at once" reports.
- **Ambient fixed UI (the integration pipeline bar) belongs outside viewport-conditional branches**, so hiding a layout never hides status.
- **The shared `--page-bottom-inset` on the routed scroller is the single source of clearance for fixed bars; hand-tuned extra spacers only create dead tails** — the 120px spacer left roughly a third of a phone screen blank. This reinforces the existing `#0602`/`#0951` rule in AGENTS.md; no new rule needed.
- **Vitest hangs under Node 26 with the repo's process-reap `globalSetup`** — run test suites through Bun (`bun node_modules/.bin/vitest run …`) as `repoos check` does. If this recurs across tasks, it belongs in `docs/agent-debugging-and-incidents.md` as a worked example.

## Follow-ups

None — no new tasks were filed from this task's issues (Linked tasks: none recorded). The reviewer's suggestions point at pre-existing surface: mirror the desktop `TaskDrawer` `moveToDone` disable conditions in `MobileTaskDetail` (review-in-flight, handoff/check busy) and a real-device pass on tap targets, both within the scope of the sibling mobile Work task #0303 rather than new work.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

---
updated_at: "2026-08-26T12:23:48Z"
review_passes: 1
id: "0298"
title: Show diff stats and loading indicator while fetching full diff
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-diff-stats-and-loading-indicator-wh
model_override: deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813
created_at: "2026-08-26T12:12:10Z"
---
## Problem

When viewing the changes tab of a task with a large number of diffs (tens of thousands), the UI shows "loading diff..." with no visual feedback. Users are left waiting without any indication of progress or preliminary information about the changes (like number of files affected or lines added/removed).

## Desired UX

While the full diff loads, show immediate feedback including:
- Number of files changed
- Lines added/removed
- A visual loading indicator (spinner or progress bar)
- Clear messaging that the full diff is still loading

This allows users to understand the scale of changes and decide whether to wait for the full diff or navigate away.

## Acceptance criteria

- [ ] Display diff statistics (files changed, lines added/removed) immediately when available
- [ ] Show a visual loading indicator during diff fetch
- [ ] Improve loading message to be more informative
- [ ] Ensure stats display even if full diff takes >5 seconds
- [ ] Maintain existing behavior for small diffs (no perceptible delay)

## Notes for AI

- Look at current diff loading implementation in web UI components
- Identify where diff stats can be extracted efficiently (likely from git diff --stat or similar)
- Use existing UI loading patterns in the codebase for consistency
- Assume large diffs are >10k lines changed if no specific threshold is defined

## Original prompt

Sometimes "loading diff..." in the changes tab of a task takes a looooong time (I suppose when there are tens of thousands of diffs?), is there a way to show some info first while waiting for the full diff to show? e.g. if we just had some info like diff'ed lines (added/removed) and files changed etc while waiting for all the diffs to load. and a better loading animation (currently there is none, just the words "loading diff...")

## Activity

- 2026-08-26T12:12:33Z · status draft→inbox, title, area, body
- 2026-08-26T12:12:57Z · model_override
- 2026-08-26T12:13:11Z · status inbox→ready
- 2026-08-26T12:13:19Z · status ready→active, branch
- 2026-08-26T12:19:57Z · status active→review


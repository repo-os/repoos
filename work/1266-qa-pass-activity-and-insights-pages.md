---
id: "1266"
title: "QA pass: Activity and Insights pages"
type: feature
status: done
priority: p2
area: web
merged_commit: 90f95d88cbdead9fd0d3163374b06b580e4edab1
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-activity-and-insights-pages
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T03:07:06Z"
updated_at: "2026-11-20T08:54:36Z"
last_close_out_gate_ms: 486241
last_close_out_gate_at: "2026-11-20T08:52:18.104Z"
review_passes: 1
---
## Problem
Sweep the Activity and Insights pages for layout, wording and state bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T03:07:06Z · created · t@t
- 2026-11-20T03:07:38Z · status inbox→ready
- 2026-11-20T03:07:52Z · cli_override, model_override
- 2026-11-20T03:08:12Z · status ready→active, branch
- 2026-11-20T03:31:54Z · body
- 2026-11-20T03:36:09Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:54:43Z · orphaned run process stopped · pid 83792 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-activity- · cpu 1s · age 20s
- 2026-11-20T03:54:43Z · status active→review
- 2026-11-20T03:54:44Z · message_queued at 2026-11-20T03:54:44.956Z
- 2026-11-20T04:00:47Z · note: review pass 1: good to go
- 2026-11-20T04:55:04Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T08:52:18Z · close-out gate completed in 486s
- 2026-11-20T08:52:55Z · status done→done, release:success
- 2026-11-20T08:54:36Z · message_dropped: 1 queued message(s) discarded — task is done

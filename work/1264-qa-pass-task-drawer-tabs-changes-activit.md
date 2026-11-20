---
id: "1264"
title: "QA pass: task drawer tabs (changes, activity, reports)"
type: feature
status: done
priority: p2
area: web
merged_commit: c2b7fa03eacefd72ff3ac1696d9ba8df32f9bf72
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-task-drawer-tabs-changes-activit
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T02:27:21Z"
updated_at: "2026-11-20T08:54:35Z"
last_close_out_gate_ms: 2367746
last_close_out_gate_at: "2026-11-20T08:42:34.098Z"
review_passes: 1
last_check_failure: "repoos check at 2026-11-20T02:47:20.639Z: repoos check failed: reused check inputs changed during handoff — run the check again"
---
## Problem
Sweep the task drawer tabs for layout, wording, loading and empty-state bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T02:27:21Z · created · t@t
- 2026-11-20T02:27:27Z · status inbox→ready
- 2026-11-20T02:27:29Z · cli_override, model_override
- 2026-11-20T02:27:31Z · status ready→active, branch
- 2026-11-20T02:41:16Z · body
- 2026-11-20T02:46:58Z · CTO nudge: held — handoff gate is running
- 2026-11-20T02:47:19Z · message_queued at 2026-11-20T02:47:19.130Z
- 2026-11-20T02:47:27Z · message_delivered: 1 message(s)
- 2026-11-20T03:07:12Z · body
- 2026-11-20T03:18:54Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:37:58Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T03:38:02Z · status active→review
- 2026-11-20T03:38:02Z · message_queued at 2026-11-20T03:38:02.412Z
- 2026-11-20T03:42:11Z · note: review pass 1: good to go
- 2026-11-20T04:45:33Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T08:42:34Z · close-out gate completed in 2368s
- 2026-11-20T08:43:28Z · status done→done, release:success
- 2026-11-20T08:54:35Z · message_dropped: 1 queued message(s) discarded — task is done

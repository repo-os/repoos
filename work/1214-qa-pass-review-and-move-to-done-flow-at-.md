---
handoff_signal_retry_count: 1
id: "1214"
title: "QA pass: review and Move to done flow at phone, tablet and desktop widths"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-review-and-move-to-done-flow-at-
created_at: "2026-11-19T02:18:22Z"
updated_at: "2026-11-19T02:29:24Z"
---
## Problem
The review and Move to done flow (task drawer, review verdicts, landable checklist, close-out errors) has not had a QA pass at phone width or with failure states.
## Desired UX
Every review/close-out state reads clearly and every button is reachable and tappable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser.
- Check the drawer in review, needs-input, closing-out, failed close-out and landed states using fixtures; fix layout, wording and dead buttons with tests.
- Commit docs/qa/2026-11-review-flow-qa.md listing what was checked.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T02:18:22Z · created · t@t
- 2026-11-19T02:19:06Z · status inbox→ready
- 2026-11-19T02:19:14Z · status ready→active, branch
- 2026-11-19T02:26:12Z · CTO nudge: held — machine under pressure (swap in/out 5.3 MB/s over 28.908 s (limit 1.0 MB/s) — holding new work until paging eases. Check Activity Monitor (Memory tab), `vm_stat 1`, or `memory_pressure -Q` on macOS; `/proc/pressure/memory` and `vmstat 1` on Linux.)
- 2026-11-19T02:29:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I added the QA record at [2026-11-review-flow-qa.md](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-review-and-move-to-done-flow-at-/docs/qa/2026-11-review-flow-qa.md) and left the engineering report draft for RepoOS to finalize. The … · stderr: Reading additional input from stdin... 2026-11-19T02:28:04.415149Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-review-and-move-to-done-flow-at-/.repoos/engineering-report-drafts/1214.md: The required scoped…


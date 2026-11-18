---
id: "1184"
title: "QA pass: web app keyboard and accessibility – focus order, labels, dialogs, contrast"
type: bug
status: active
needs_input: true
needs_input_reason: watchdog-stuck
needs_input_detail: "3 automatic resume(s) in this active episode did not produce a handoff — the engineer keeps ending its turn without one. Review the transcript and resume it manually; if the conversation is poisoned, reset it with `repoos start 1184 --fresh`."
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-keyboard-and-accessibili
created_at: "2026-11-18T12:17:32Z"
updated_at: "2026-11-18T13:12:45Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-18T12:45:29.556Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-18T12:54:45.117Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-18T13:03:30.252Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
Keyboard and screen-reader behavior of dialogs, drawers and menus has not had a recent pass.
## Desired UX
Every dialog/drawer traps and restores focus, controls have accessible names, Escape closes overlays, and contrast passes in light and dark themes.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) and check Work, Settings, Releases and Agents with keyboard only; fix bugs with tests.
- Commit docs/qa/2026-11-keyboard-a11y.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T12:17:32Z · created · t@t
- 2026-11-18T12:17:36Z · status inbox→ready
- 2026-11-18T12:17:39Z · status ready→active, branch
- 2026-11-18T12:19:14Z · note: adopted orphaned engineer pid 52979
- 2026-11-18T12:23:04Z · body
- 2026-11-18T12:24:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: Implemented the Agents Skills dialog fix: its close button now has the accessible name “Close dialog,” with a regression test in [keyboard-a11y.test.ts](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-keyboard-and-accessibili/s… · stderr: Reading additional input from stdin...
- 2026-11-18T12:33:03Z · body
- 2026-11-18T12:33:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The worktree is clean, and `REPOOS_CHECK_CHANGED=main repoos check` passed again. The rendered contrast audit and UI smoke test passed; 184 scoped tests passed on the remote runner. I retried browser access, but the browser host is still u… · stderr: (empty)
- 2026-11-18T12:40:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The recheck passed, including build, scoped tests, rendered contrast, and UI smoke. Chrome itself was accessible, but its `127.0.0.1:7272/work` tab showed a stale preview with the server disconnected, so it could not provide the requested … · stderr: (empty)
- 2026-11-18T12:45:29Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-18T12:48:47Z · body
- 2026-11-18T12:49:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The existing fix and QA documentation are in place, and `REPOOS_CHECK_CHANGED=main repoos check` passed on this run. The rendered contrast audit and UI smoke test passed as well. I couldn’t complete the required keyboard-only walkthrough o… · stderr: Reading additional input from stdin...
- 2026-11-18T12:54:45Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-18T12:57:21Z · body
- 2026-11-18T12:58:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The Agents Skills dialog close button now has the accessible name “Close dialog,” with a regression test. The QA note and engineering report draft are in place. `REPOOS_CHECK_CHANGED=main repoos check` passed, including the build, 184 test… · stderr: Reading additional input from stdin...
- 2026-11-18T13:03:30Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 3/3
- 2026-11-18T13:05:35Z · body
- 2026-11-18T13:07:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The Agents Skills dialog now gives its close button the accessible name “Close dialog,” with a regression test. The QA note is at [2026-11-keyboard-a11y.md](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-keyboard-and-accessibi… · stderr: Reading additional input from stdin... 2026-11-18T13:06:29.785167Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-keyboard-and-accessibili/.repoos/engineering-report-drafts/1184.md: The required change…
- 2026-11-18T13:12:45Z · watchdog: escalated to needs_input · 3 automatic resume(s) in this active episode produced no handoff

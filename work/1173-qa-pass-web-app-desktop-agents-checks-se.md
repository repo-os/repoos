---
id: "1173"
title: "QA pass: web app desktop – Agents, Checks, Settings, Releases pages end to end"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-desktop-agents-checks-se
created_at: "2026-11-18T03:57:22Z"
updated_at: "2026-11-18T05:24:13Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-18T04:29:14.766Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-18T04:41:03.570Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-18T04:49:49.328Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
Desktop web pages beyond Work may hide regressions after many recent UI changes.
## Desired UX
Agents, Checks, Settings and Releases pages load without console errors and every control works.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) at desktop width on those four pages; skip issues #1157 and #1168 already covered.
- Fix bugs found with tests.
- Commit docs/qa/2026-11-web-desktop-pages.md with findings.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
  "label": "Settings import/export flow",
  "target": "default",
  "route": "/settings?tab=import-export",
  "highlight": "#settings-panel-import-export"
}
]
```

## Activity

- 2026-11-18T03:57:22Z · created · t@t
- 2026-11-18T03:57:29Z · status inbox→ready
- 2026-11-18T03:57:32Z · status ready→active, branch
- 2026-11-18T03:59:58Z · body
- 2026-11-18T04:00:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The live QA pass is blocked: the browser host exposed no tabs, and the runner instructions prohibit starting the long-lived local server the task requires. I did not verify the pages or console, so I made no code changes and did not create… · stderr: Reading additional input from stdin...
- 2026-11-18T04:09:32Z · body
- 2026-11-18T04:10:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task is still incomplete, so I did not emit the handoff signal. I started `just serve-noauth 7272` in the assigned worktree and opened `/agents` in Chrome. The server bound on the runner, but Chrome received `ERR_CONNECTION_REFUSED` be… · stderr: 2026-11-18T04:07:12.907838Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-desktop-agents-checks-se/.repoos/engineering-report-drafts/1173.md: A follow-up turn needs an authorized, available way to ser…
- 2026-11-18T04:18:32Z · body
- 2026-11-18T04:24:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task remains incomplete, so I did not emit the handoff signal. The scoped check passed again, including the UI smoke test. The worktree is clean and #1173 remains active. The blocker is still live browser access: the runner’s auth-less… · stderr: 2026-11-18T04:07:12.907838Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-desktop-agents-checks-se/.repoos/engineering-report-drafts/1173.md: A follow-up turn needs an authorized, available way to ser…
- 2026-11-18T04:29:14Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-18T04:35:26Z · body
- 2026-11-18T04:35:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The changed-path check passed, including build, lint, scoped tests, and UI smoke. The required live desktop QA is still blocked: CUA reports that its browser access host is unavailable, so I couldn’t exercise the four pages or inspect thei… · stderr: Reading additional input from stdin...
- 2026-11-18T04:41:03Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-18T04:43:04Z · body
- 2026-11-18T04:44:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: #1173 remains active; the live desktop pass is still blocked. CUA reported no available browsers, and the previous attempt found that Chrome could not reach the auth-less server on the runner. I did not verify the four pages or their conso… · stderr: Reading additional input from stdin... 2026-11-18T04:43:58.440085Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-desktop-agents-checks-se/.repoos/engineering-report-drafts/1173.md: - Queried the compu…
- 2026-11-18T04:49:49Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 3/3
- 2026-11-18T05:02:12Z · CTO nudge: held — handoff gate is running
- 2026-11-18T05:04:23Z · status active→review
- 2026-11-18T05:04:23Z · message_queued at 2026-11-18T05:04:23.831Z
- 2026-11-18T05:04:24Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T05:05:03Z · note: review pass 1: needs some work
- 2026-11-18T05:05:04Z · message_delivered: 1 message(s)
- 2026-11-18T05:05:04Z · status review→active
- 2026-11-18T05:24:13Z · body

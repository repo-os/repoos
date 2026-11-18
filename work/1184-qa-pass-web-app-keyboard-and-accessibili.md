---
id: "1184"
title: "QA pass: web app keyboard and accessibility – focus order, labels, dialogs, contrast"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-keyboard-and-accessibili
created_at: "2026-11-18T12:17:32Z"
updated_at: "2026-11-18T14:39:10Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-18T14:38:37.835Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Agents Skills dialog accessible close control (target \"default\"): click button.agent-skills-add: click: Error: strict mode violation: locator('button.agent-skills-add') resolved to 6 elements: on /agents?tab=default (http://127.0.0.1:42821/agents?tab=default); [missing-target] Agents Skills dialog accessible close control (target \"default\"): highlight .am-modal matched nothing on /agents?tab=default (http://127.0.0.1:4282… (truncated)"
review_rounds: 1
routing_switches: 1
review_passes: 1
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

## Shots
```json
[
{
  "label": "Work route keyboard QA",
  "target": "default",
  "route": "/work"
},
{
  "label": "Settings route keyboard QA",
  "target": "default",
  "route": "/settings"
},
{
  "label": "Releases route keyboard QA",
  "target": "default",
  "route": "/releases"
},
{
  "label": "Agents Skills dialog accessible close control",
  "target": "default",
  "route": "/agents?tab=default",
  "highlight": ".am-modal",
  "steps": [
    {
      "click": "button.agent-skills-add[aria-label=\"Add skills to engineer\"]"
    },
    {
      "waitMs": 300
    }
  ]
}
]
```

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
- 2026-11-18T13:22:45Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-18T13:26:21Z · body
- 2026-11-18T13:30:10Z · body
- 2026-11-18T13:30:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The final scoped check passed. It reported 184 scoped tests and two timing tests passing, the rendered contrast audit passing across 16 theme scopes and 14 states, and UI smoke passing. I corrected the audit count in [the QA note](/Users/n… · stderr: Reading additional input from stdin... 2026-11-18T13:26:55.978926Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 28468
- 2026-11-18T13:36:16Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-18T13:40:52Z · body
- 2026-11-18T13:42:02Z · note: The required live keyboard-only walkthrough of Work, Settings, Releases, and Agents remains unverified. This session's browser host reports unavailable, and managed runner rules prohibit launching the task-specified scratch auth-less server here. Automated check passed, but does not prove Tab order, Escape dismissal, focus containment, or restoration. Please split the remaining walkthrough into a held human task and complete it in an available browser/server session; do not mark this criterion complete from automated evidence alone.
- 2026-11-18T13:42:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The existing implementation and regression test are in place, and the required scoped check passed: 184 tests, build, contrast audit, and UI smoke. I couldn’t complete the required keyboard-only walkthrough. The browser access host was una… · stderr: Reading additional input from stdin...
- 2026-11-18T13:47:40Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-18T13:50:47Z · body
- 2026-11-18T13:52:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check passed: build, formatting and lint, **184 tests**, rendered contrast across 16 theme scopes and 14 screen states, and UI smoke in light and dark modes. The live keyboard-only walkthrough of Work, Settings, Releases and Age… · stderr: Reading additional input from stdin...
- 2026-11-18T14:01:15Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-18T14:07:57Z · message_queued at 2026-11-18T14:07:57.113Z
- 2026-11-18T14:08:10Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T14:09:48Z · body
- 2026-11-18T14:12:01Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T14:12:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The first check stopped at the formatter before build, tests, or smoke ran. I’ll apply the repo formatter as required, then rerun the same scoped check. · stderr: Reading additional input from stdin...
- 2026-11-18T14:12:01Z · message_delivered: 1 message(s)
- 2026-11-18T14:19:59Z · body
- 2026-11-18T14:22:40Z · body
- 2026-11-18T14:26:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T14:27:18Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T14:27:19Z · status active→review
- 2026-11-18T14:27:20Z · message_queued at 2026-11-18T14:27:20.014Z
- 2026-11-18T14:27:57Z · note: review pass 1: needs some work
- 2026-11-18T14:27:58Z · message_delivered: 1 message(s)
- 2026-11-18T14:27:58Z · status review→active
- 2026-11-18T14:28:00Z · CTO nudge: held — remote validation is running
- 2026-11-18T14:29:58Z · body
- 2026-11-18T14:34:30Z · body
- 2026-11-18T14:36:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T14:38:34Z · note: ui verification failed: ui verification failed (2 issue(s)): [missing-target] Agents Skills dialog accessible close control (target "default"): click button.agent-skills-add: click: Error: strict mode violation: locator('button.agent-skills-add') resolved to 6 elements: on /agents?tab=default (http://127.0.0.1:42821/agents?tab=default); [missing-target] Agents Skills dialog accessible close control (target "default"): highlight .am-modal matched nothing on /agents?tab=default (http://127.0.0.1:4
- 2026-11-18T14:38:34Z · message_queued at 2026-11-18T14:38:34.656Z
- 2026-11-18T14:38:37Z · message_delivered: 1 message(s)
- 2026-11-18T14:39:10Z · body

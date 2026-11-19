---
id: "1211"
title: "QA pass: remote runner setup docs and runner health screens vs real bee/thinkpad/mini behavior"
type: bug
status: review
priority: p2
area: [web, docs]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-remote-runner-setup-docs-and-run
created_at: "2026-11-19T00:17:32Z"
updated_at: "2026-11-19T02:16:52Z"
handoff_signal_retry_count: 1
review_rounds: 2
routing_switches: 1
routing_escalations: 1
review_passes: 2
---
## Problem
Docs and UI for adding and checking remote runners may not match how bee, thinkpad and mini are actually run (systemd, user accounts, PATH).
## Desired UX
Docs and runner health screens match reality, including the case where a server runs under a different user than the ssh login.
## Acceptance criteria
- Read-only: do not ssh or change any runner. Compare user-docs and runner UI/code paths with the scripts in justfile (setup-bee etc.); headless Playwright only if UI is touched; never open a visible browser.
- Fix stale docs and UI wording with tests; commit docs/qa/2026-11-runner-docs.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Remote runner identity note",
"target": "default",
"route": "/checks?tab=now",
"highlight": "[data-test-id=\"runner-identity-note\"]",
"state": "runners:queued"
}
]
```

## Activity

- 2026-11-19T00:17:32Z · created · t@t
- 2026-11-19T00:17:37Z · status inbox→ready
- 2026-11-19T00:17:39Z · status ready→active, branch
- 2026-11-19T00:27:45Z · CTO nudge: held — handoff gate is running
- 2026-11-19T00:33:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T00:41:31Z · status active→review
- 2026-11-19T00:41:31Z · message_queued at 2026-11-19T00:41:31.782Z
- 2026-11-19T00:41:31Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-19T00:42:03Z · note: review pass 1: needs some work
- 2026-11-19T00:42:03Z · message_delivered: 1 message(s)
- 2026-11-19T00:42:03Z · status review→active
- 2026-11-19T00:49:12Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-19T00:54:25Z · body
- 2026-11-19T00:59:24Z · status active→review
- 2026-11-19T00:59:25Z · message_queued at 2026-11-19T00:59:25.860Z
- 2026-11-19T00:59:26Z · status review→active
- 2026-11-19T00:59:28Z · CTO nudge: held — handoff gate is running
- 2026-11-19T01:12:22Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-19T01:12:23Z · status active→review
- 2026-11-19T01:12:23Z · message_queued at 2026-11-19T01:12:23.810Z
- 2026-11-19T01:13:08Z · note: review pass 2: needs some work
- 2026-11-19T01:13:09Z · message_delivered: 2 message(s)
- 2026-11-19T01:13:09Z · status review→active
- 2026-11-19T01:13:12Z · CTO nudge: held — remote validation is running
- 2026-11-19T01:18:59Z · CTO nudge: held — handoff gate is running
- 2026-11-19T01:31:12Z · CTO nudge: held — handoff gate is running
- 2026-11-19T01:46:09Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-19T01:46:10Z · message_queued at 2026-11-19T01:46:10.599Z
- 2026-11-19T01:46:10Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-19T01:46:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T01:49:16Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T01:49:18Z · message_delivered: 1 message(s)
- 2026-11-19T01:56:23Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The runner setup documentation and health screen changes are in place, with regression tests. I added the missing 1,134-word engineering report draft at `.repoos/engineering-report-drafts/1211.md` and updated the QA record to accurately de… · stderr: Reading additional input from stdin... 2026-11-19T01:55:51.095137Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-remote-runner-setup-docs-and-run/.repoos/engineering-report-drafts/1211.md: There is no technic…
- 2026-11-19T01:56:26Z · note: handoff requested (cli)
- 2026-11-19T02:01:12Z · CTO nudge: held — handoff gate is running
- 2026-11-19T02:15:45Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-19T02:15:46Z · status active→review
- 2026-11-19T02:15:47Z · message_queued at 2026-11-19T02:15:47.206Z
- 2026-11-19T02:16:52Z · note: review pass 3: needs some work

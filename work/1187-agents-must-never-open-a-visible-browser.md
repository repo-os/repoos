---
id: "1187"
title: "Agents must never open a visible browser or steal focus: add rule + guard for QA/preview runs"
type: chore
status: review
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: feat/agents-must-never-open-a-visible-browser
created_at: "2026-11-18T14:08:00Z"
updated_at: "2026-11-18T16:10:00Z"
last_check_failure: "repoos check at 2026-11-18T15:42:06.935Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
---
## Problem
Nick reports QA engineers' preview servers (e.g. http://127.0.0.1:7273/agents from #1184's 'just serve-noauth') pop open in his real Chrome and take focus from his laptop. Nothing in serve/justfile opens a browser, so the engineer (codex luna) did it via open/xdg-open, a headed browser, or system Chrome.
## Desired UX
Agents verify UI headlessly only; nothing ever steals focus on the human's machine.
## Acceptance criteria
- Add a one-line rule to AGENTS.md (keep under 30 KB) and the long form in docs/agent-ui-and-preview-conventions.md: never run open/xdg-open on URLs, never launch a headed browser or the user's Chrome profile; use headless Playwright with its bundled browser.
- Add the same rule to the engineer agent instructions text where they are defined (default template), with a test.
- Find where a browser was actually launched (check recent engineer transcripts for open/channel: chrome/headless false) and fix any repo script that does it.
## Notes for AI
Do not touch repoos.toml (the live engineer instructions there are Nick's to edit; propose the text in the task notes instead).

## Activity

- 2026-11-18T14:08:00Z · created · t@t
- 2026-11-18T14:47:39Z · status inbox→ready
- 2026-11-18T14:47:42Z · status ready→active, branch
- 2026-11-18T15:01:14Z · message_queued at 2026-11-18T15:01:14.741Z
- 2026-11-18T15:01:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T15:04:17Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T15:04:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The focused prompt test and surrounding changed-path suite have not reported a failure; the run is still advancing through the broader always-run gate set. The main checkout remains untouched, and `AGENTS.md` is still below the 30 KB ceili… · stderr: Reading additional input from stdin...
- 2026-11-18T15:04:25Z · message_delivered: 1 message(s)
- 2026-11-18T15:04:28Z · message_queued at 2026-11-18T15:04:28.470Z
- 2026-11-18T15:04:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T15:06:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T15:17:02Z · CTO nudge: held — handoff gate is running
- 2026-11-18T15:42:03Z · message_queued at 2026-11-18T15:42:03.801Z
- 2026-11-18T15:42:03Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-18T15:42:06Z · message_delivered: 1 message(s)
- 2026-11-18T15:56:00Z · body
- 2026-11-18T15:57:02Z · CTO nudge: held — handoff gate is running
- 2026-11-18T16:10:00Z · status active→review
- 2026-11-18T16:10:00Z · message_queued at 2026-11-18T16:10:00.969Z

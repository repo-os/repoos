---
id: "1254"
title: "QA pass: Stories page create, link and progress flows at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stories-page-create-link-and-pro
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T23:27:29Z"
updated_at: "2026-11-20T01:18:17Z"
---
## Problem
Creating a story, linking tasks to it and reading its progress have not been exercised end to end with edge cases.
## Desired UX
Story create, link, unlink and progress work with plain-English validation and no dead controls at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser.
- Cover empty, many-task, duplicate-name and failure cases; fix issues with tests.
- Commit docs/qa/2026-11-story-flows-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T23:27:29Z · created · t@t
- 2026-11-19T23:27:36Z · status inbox→ready
- 2026-11-19T23:27:39Z · cli_override, model_override
- 2026-11-19T23:27:40Z · status ready→active, branch
- 2026-11-19T23:45:11Z · body
- 2026-11-19T23:52:46Z · CTO nudge: held — handoff gate is running
- 2026-11-20T00:01:37Z · CTO nudge: held — handoff gate is running
- 2026-11-20T00:22:08Z · CTO nudge: held — handoff gate is running
- 2026-11-20T00:36:51Z · handoff failed · remote validation failed: test failure: tests/sign-in-users-qa-browser.test.ts > sign-in, users and user menu QA (#1239) > sign-in at 1280px > tells a locked-out visitor to wait, in plain English on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-20T00:36:52Z · message_queued at 2026-11-20T00:36:52.236Z
- 2026-11-20T00:36:52Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-20T00:37:00Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T00:39:56Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T00:40:04Z · message_delivered: 1 message(s)
- 2026-11-20T00:59:50Z · body
- 2026-11-20T01:04:32Z · CTO nudge: held — handoff gate is running
- 2026-11-20T01:18:17Z · note: ui verification passed: 1 shot captured with clean console

---
id: "1157"
title: "QA pass: use the RepoOS web app on desktop and phone widths, find broken things and fix them"
type: bug
status: active
priority: p1
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-use-the-repoos-web-app-on-deskto
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T15:21:15Z"
updated_at: "2026-11-17T16:36:58Z"
handoff_signal_retry_count: 2
---
## Problem

Nick wants the app actually used, not only unit tested: several regressions recently reached users (the page height/scroll break from #1120's removed id="app", the Move to done click bug, the macOS Hub broken for weeks). Nobody drives the real UI end to end before release.

## Desired UX

Every main page works at desktop width (1280+) and at phone width (390 and 320) in light and dark themes: nothing overlaps, scrolls wrongly, is clipped or unreachable, and no console errors appear.

## Acceptance criteria

- [ ] Using a browser (Playwright is available to the repo's smoke test; run it against a task-worktree dev server with `just serve-noauth`, never the served checkout), open each main page (Control, Inputs, Work in Board and Pipeline views, a task drawer with its tabs, Stories, Checks, Releases including the cut panel, Deployments, Dev, Secrets, Agents, Context, Settings and its tabs) at 1440, 390 and 320 widths in light and dark themes, and take screenshots of each. Look at every screenshot yourself.
- [ ] Click through the main actions on each (open and close the drawer, switch tabs, open dialogs and modals, scroll to the bottom of each page) and record every defect: overlap, clipping, unreachable control, wrong scroll area, missing bottom clearance, console error, failed request.
- [ ] Fix every defect that is small and clear in this task, with a test for each; for anything larger, file a separate task with the screenshot attached (repoos new ... --screenshot) and list it in the report.
- [ ] The report lists each page and width checked, the defects found, which were fixed and which were filed. No page is reported as checked without a screenshot.
- [ ] Never use or capture Nick's own desktop or other windows, and never touch the served checkout's server.

## Notes for AI

Start with the Work page at 390px and the bottom dock/heads/pipeline bar overlap on every page, since those regressed recently. Do not edit repoos.toml.

## Activity

- 2026-11-17T15:21:15Z · created · t@t
- 2026-11-17T15:21:19Z · cli_override, model_override
- 2026-11-17T15:21:22Z · status inbox→ready
- 2026-11-17T15:21:24Z · status ready→active, branch
- 2026-11-17T15:39:27Z · body
- 2026-11-17T15:42:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I completed and reviewed the responsive screenshot pass for the listed routes at 1440, 390 and 320px in light and dark. The corrected run found no horizontal overflow. The task-worktree server was stopped, and the main checkout was untouch… · stderr: Reading additional input from stdin... 2026-11-17T15:36:51.547593Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 86199
- 2026-11-17T16:12:03Z · body
- 2026-11-17T16:12:28Z · message_queued at 2026-11-17T16:12:28.386Z
- 2026-11-17T16:15:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T16:15:42Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T16:20:45Z · message_queued at 2026-11-17T16:20:45.790Z
- 2026-11-17T16:24:07Z · message_delivered: 1 message(s)
- 2026-11-17T16:30:33Z · body
- 2026-11-17T16:31:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The QA pass found no clear visual defect to fix. The saved screenshots cover all listed pages and tabs at 1440, 390, and 320px in light and dark themes; the report records the Checks-tab interaction stall and the auth-limited Secrets and A… · stderr: Reading additional input from stdin...
- 2026-11-17T16:33:43Z · message_delivered: 1 message(s)
- 2026-11-17T16:33:50Z · message_queued at 2026-11-17T16:33:50.638Z
- 2026-11-17T16:36:57Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T16:36:58Z · message_delivered: 1 message(s)

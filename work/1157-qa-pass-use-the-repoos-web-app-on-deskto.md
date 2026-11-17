---
id: "1157"
title: "QA pass: use the RepoOS web app on desktop and phone widths, find broken things and fix them"
type: bug
status: inbox
priority: p1
area: web
assigned_to: ""
created_by: t@t
branch: ""
created_at: "2026-11-17T15:21:15Z"
updated_at: "2026-11-17T15:21:15Z"
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

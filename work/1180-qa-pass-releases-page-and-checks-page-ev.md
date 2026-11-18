---
id: "1180"
title: "QA pass: Releases page and Checks page – every state and action"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-releases-page-and-checks-page-ev
created_at: "2026-11-18T08:17:32Z"
updated_at: "2026-11-18T08:41:11Z"
---
## Problem
Releases and Checks pages changed a lot in v0.5.90 and may have state bugs.
## Desired UX
Every state (ready, blocked, running, failed, done) of the Releases and Checks pages renders correctly and actions behave, at 1280 and 375 widths.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) using fixtures; never publish a real release.
- Fix bugs with tests; commit docs/qa/2026-11-releases-checks.md.
## Notes for AI
Do not touch repoos.toml; skip what #1168 and #1173 covered.

## Shots
```json
[
{
"label": "Checks page progress and local slot recovery",
"target": "default",
"route": "/checks?tab=now&shotState=checks:progress",
"highlight": "[data-test-id=\"checks-page-progress\"]"
}
]
```

## Activity

- 2026-11-18T08:17:32Z · created · t@t
- 2026-11-18T08:17:37Z · status inbox→ready
- 2026-11-18T08:17:41Z · status ready→active, branch
- 2026-11-18T08:27:34Z · body
- 2026-11-18T08:30:00Z · body
- 2026-11-18T08:38:13Z · body
- 2026-11-18T08:39:37Z · body
- 2026-11-18T08:41:11Z · CTO nudge: held — handoff gate is running

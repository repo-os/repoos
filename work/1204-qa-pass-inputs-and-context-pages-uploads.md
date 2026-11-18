---
id: "1204"
title: "QA pass: Inputs and Context pages – uploads, docs ingestion and empty states"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-inputs-and-context-pages-uploads
created_at: "2026-11-18T20:47:45Z"
updated_at: "2026-11-18T21:05:50Z"
---
## Problem
Inputs and Context pages have not had a hands-on pass.
## Desired UX
Uploads, lists, previews and empty or error states work at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-inputs-context.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
"label": "Inputs list with new-input action",
"target": "default",
"route": "/inputs",
"highlight": ".inputs-header"
},
{
"label": "Context docs tree and document preview",
"target": "default",
"route": "/repo",
"highlight": ".repo-grid"
}
]
```

## Activity

- 2026-11-18T20:47:45Z · created · t@t
- 2026-11-18T20:47:48Z · status inbox→ready
- 2026-11-18T20:47:50Z · status ready→active, branch
- 2026-11-18T20:54:35Z · body
- 2026-11-18T20:58:51Z · body
- 2026-11-18T21:05:50Z · body

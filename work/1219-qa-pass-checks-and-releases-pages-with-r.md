---
id: "1219"
title: "QA pass: Checks and Releases pages with real data at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-checks-and-releases-pages-with-r
created_at: "2026-11-19T06:17:33Z"
updated_at: "2026-11-19T06:24:19Z"
---
## Problem
The Checks and Releases pages have not been checked with long lists, long names and slow data at phone, tablet and desktop widths.
## Desired UX
Long titles, many rows and slow loads stay readable and usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Use fixtures with long and many rows; fix truncation, overflow and dead controls with tests.
- Commit docs/qa/2026-11-checks-releases-data-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Checks with long step data",
"target": "default",
"route": "/checks?tab=plan",
"highlight": ".ck-steps"
},
{
"label": "Releases distribution and channel data",
"target": "default",
"route": "/releases",
"highlight": ".rel-dist"
}
]
```

## Activity

- 2026-11-19T06:17:33Z · created · t@t
- 2026-11-19T06:17:35Z · status inbox→ready
- 2026-11-19T06:17:37Z · status ready→active, branch
- 2026-11-19T06:19:45Z · body
- 2026-11-19T06:22:54Z · body
- 2026-11-19T06:23:49Z · body
- 2026-11-19T06:24:19Z · body

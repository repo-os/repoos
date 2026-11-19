---
id: "1243"
title: "QA pass: Agents page failure copy after the Jev routing switch and missing key"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-failure-copy-after-t
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T20:07:21Z"
updated_at: "2026-11-19T20:28:49Z"
---
## Problem
After switching model routing to Jev, the Agents page routing tab and decisions list need a check for the missing-key and provider-failure wording and a recent-decisions list that is empty or all failures.
## Desired UX
A missing key or failing provider is explained in plain English with the next step; the decisions list shows an honest empty or failure state; keys stay masked.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never use or print real keys.
- Fix issues with tests; commit docs/qa/2026-11-routing-failure-copy-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Routing tab recent decisions list (failed-load notice is covered by WebKit fixture, not this board)",
"target": "default",
"route": "/agents?tab=model-routing",
"selector": ".mr-decisions",
"highlight": ".mr-decisions"
}
]
```

## Activity

- 2026-11-19T20:07:21Z · created · t@t
- 2026-11-19T20:07:25Z · status inbox→ready
- 2026-11-19T20:07:26Z · cli_override, model_override
- 2026-11-19T20:07:27Z · status ready→active, branch
- 2026-11-19T20:26:33Z · body
- 2026-11-19T20:27:28Z · body
- 2026-11-19T20:28:49Z · CTO nudge: held — handoff gate is running

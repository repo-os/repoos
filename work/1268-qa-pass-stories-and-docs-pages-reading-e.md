---
id: "1268"
title: "QA pass: Stories and Docs pages reading experience"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stories-and-docs-pages-reading-e
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T05:07:07Z"
updated_at: "2026-11-20T05:47:27Z"
handoff_signal_retry_count: 1
---
## Problem
Sweep the Docs and Story detail pages for layout, long-text wrapping, link and wording bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Shots
```json
[
{
"label": "Docs reader: doc tree rows are buttons with a selected row, long doc title wraps",
"target": "default",
"route": "/repo?doc=docs/agent-ui-and-preview-conventions.md",
"highlight": ".tree-file.sel"
}
]
```

## Activity

- 2026-11-20T05:07:07Z · created · t@t
- 2026-11-20T05:07:33Z · status inbox→ready
- 2026-11-20T05:07:45Z · cli_override, model_override
- 2026-11-20T05:08:03Z · status ready→active, branch
- 2026-11-20T05:13:24Z · message_queued at 2026-11-20T05:13:24.153Z
- 2026-11-20T05:17:27Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T05:37:35Z · body
- 2026-11-20T05:45:46Z · body
- 2026-11-20T05:47:17Z · body
- 2026-11-20T05:47:27Z · handoff_deferred: 1 queued message(s) must be read before review

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
updated_at: "2026-11-20T05:13:24Z"
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

## Activity

- 2026-11-20T05:07:07Z · created · t@t
- 2026-11-20T05:07:33Z · status inbox→ready
- 2026-11-20T05:07:45Z · cli_override, model_override
- 2026-11-20T05:08:03Z · status ready→active, branch
- 2026-11-20T05:13:24Z · message_queued at 2026-11-20T05:13:24.153Z

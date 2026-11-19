---
id: "1237"
title: "QA pass: Stories, Inbox and Search pages with many items at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stories-inbox-and-search-pages-w
created_at: "2026-11-19T17:46:51Z"
updated_at: "2026-11-19T18:06:52Z"
---
## Problem
Stories, Inbox and Search have not been checked with many items, long titles and zero results at phone, tablet and desktop widths.
## Desired UX
Lists stay readable and fast to scan, empty and no-result states are plain English, and nothing overflows at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures with 200+ items and long titles; fix overflow, clipped controls and dead links with tests.
- Commit docs/qa/2026-11-stories-inbox-search-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T17:46:51Z · created · t@t
- 2026-11-19T17:46:54Z · status inbox→ready
- 2026-11-19T17:46:55Z · status ready→active, branch
- 2026-11-19T17:46:55Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T18:06:52Z · engineer stopped by request

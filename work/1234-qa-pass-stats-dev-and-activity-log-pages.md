---
id: "1234"
title: "QA pass: Stats, Dev and activity-log pages at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stats-dev-and-activity-log-pages
created_at: "2026-11-19T15:47:33Z"
updated_at: "2026-11-19T15:47:38Z"
---
## Problem
The Stats, Dev and activity/log views show long tables, code-like output and charts that have not been QA-checked at phone, tablet and desktop widths.
## Desired UX
Tables scroll or reflow, long lines wrap or scroll inside their own box, charts stay readable, and nothing forces horizontal page scroll at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures with long rows and output; fix overflow, clipped controls and unreadable charts with tests.
- Commit docs/qa/2026-11-stats-dev-pages-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T15:47:33Z · created · t@t
- 2026-11-19T15:47:36Z · status inbox→ready
- 2026-11-19T15:47:38Z · status ready→active, branch
- 2026-11-19T15:47:38Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash

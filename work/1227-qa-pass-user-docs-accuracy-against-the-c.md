---
id: "1227"
title: "QA pass: user-docs accuracy against the current UI and CLI"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-user-docs-accuracy-against-the-c
created_at: "2026-11-19T09:47:43Z"
updated_at: "2026-11-19T09:51:25Z"
---
## Problem
user-docs/ may describe screens, tab names, CLI flags and defaults that changed in recent releases.
## Desired UX
A new user following user-docs finds every screen, button, command and default exactly as described.
## Acceptance criteria
- Compare user-docs against `repoos --help` output, getConfigSchema() and current UI labels; fix stale text, scoped to what actually changed since v0.5.89.
- No ssh and no changes to any runner; headless only if the UI is touched.
- Commit docs/qa/2026-11-user-docs-accuracy-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T09:47:43Z · created · t@t
- 2026-11-19T09:47:47Z · status inbox→ready
- 2026-11-19T09:47:49Z · status ready→active, branch
- 2026-11-19T09:47:49Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T09:51:25Z · note: stopped orphaned engineer pid 95418

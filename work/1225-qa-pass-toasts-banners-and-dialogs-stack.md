---
id: "1225"
title: "QA pass: toasts, banners and dialogs stacking and dismissal at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-toasts-banners-and-dialogs-stack
created_at: "2026-11-19T09:17:32Z"
updated_at: "2026-11-19T09:17:36Z"
---
## Problem
The Hub and web app have many toasts, banners and confirmation dialogs; they have not been checked together for stacking, dismissal and keyboard use at small sizes.
## Desired UX
Toasts, banners and dialogs never overlap important controls, can be dismissed by keyboard and touch, and read well at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Trigger several at once using fixtures; fix overlap, stuck banners and dead dismiss controls with tests.
- Commit docs/qa/2026-11-toasts-banners-dialogs-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T09:17:32Z · created · t@t
- 2026-11-19T09:17:35Z · status inbox→ready
- 2026-11-19T09:17:36Z · status ready→active, branch
- 2026-11-19T09:17:36Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash

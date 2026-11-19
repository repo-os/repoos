---
id: "1223"
title: "QA pass: Agents page, model providers and routing tab at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-model-providers-and-
created_at: "2026-11-19T07:47:39Z"
updated_at: "2026-11-19T07:47:50Z"
---
## Problem
The Agents page (agent list, Model providers, Model routing tab) has not been QA-checked since the routing provider changed to Jev, including the missing-API-key state.
## Desired UX
Every tab explains a missing key or failed provider in plain English and stays usable at 375, 768 and 1280 px. Key fields stay masked (Saved / Not set only).
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never use or print real keys.
- Check missing-key, provider-failure and recent-decisions states; fix issues with tests.
- Commit docs/qa/2026-11-agents-routing-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:47:39Z · created · t@t
- 2026-11-19T07:47:46Z · status inbox→ready
- 2026-11-19T07:47:50Z · status ready→active, branch
- 2026-11-19T07:47:50Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash

---
id: "1224"
title: "QA pass: first-run onboarding and empty-project states at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-first-run-onboarding-and-empty-p
created_at: "2026-11-19T07:48:01Z"
updated_at: "2026-11-19T07:48:23Z"
---
## Problem
A brand-new project (no tasks, no agents configured, no runners) has not been QA-checked for what a new user sees.
## Desired UX
Empty Work, Agents and Checks pages explain what to do next in plain English and work at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Check each empty state and first-run path; fix wording, layout and dead links with tests.
- Commit docs/qa/2026-11-first-run-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:48:01Z · created · t@t
- 2026-11-19T07:48:18Z · status inbox→ready
- 2026-11-19T07:48:23Z · status ready→active, branch
- 2026-11-19T07:48:23Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash

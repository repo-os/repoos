---
id: "1222"
title: "QA pass: every Settings tab saves, validates and fits small screens (round 2)"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-every-settings-tab-saves-validat
created_at: "2026-11-19T07:17:47Z"
updated_at: "2026-11-19T09:15:08Z"
---
## Problem
The Settings pages have many toggles and fields; some may not persist, may accept invalid values, or may be unreachable on a phone.
## Desired UX
Every Settings tab saves, validates with plain-English errors, survives reload and stays usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus; never write the real repoos.toml.
- Walk every Settings tab; fix issues with tests.
- Commit docs/qa/2026-11-settings-tabs-qa-2.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:17:47Z · created · t@t
- 2026-11-19T07:17:52Z · status inbox→ready
- 2026-11-19T07:17:55Z · status ready→active, branch
- 2026-11-19T07:17:55Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T09:15:08Z · status active→review

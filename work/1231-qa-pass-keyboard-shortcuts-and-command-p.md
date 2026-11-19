---
id: "1231"
title: "QA pass: keyboard shortcuts and command palette across pages"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-keyboard-shortcuts-and-command-p
created_at: "2026-11-19T13:47:53Z"
updated_at: "2026-11-19T13:47:58Z"
---
## Problem
Keyboard shortcuts and any command palette or search shortcut have not been checked for conflicts, discoverability or touch/small-screen behavior.
## Desired UX
Shortcuts work on every main page without clashing with text fields, are listed somewhere findable, and nothing breaks at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Inventory the shortcuts, test them with focus in inputs, dialogs and drawers; fix conflicts and dead shortcuts with tests.
- Commit docs/qa/2026-11-keyboard-shortcuts-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T13:47:53Z · created · t@t
- 2026-11-19T13:47:56Z · status inbox→ready
- 2026-11-19T13:47:58Z · status ready→active, branch
- 2026-11-19T13:47:58Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash

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
updated_at: "2026-11-19T14:10:34Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-11-19T14:04:52.658Z\",\"kind\":\"dev-error\"}]"
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

## Shots
```json
[
{
  "label": "Command palette open over the dashboard",
  "target": "default",
  "route": "/",
  "highlight": ".search-overlay",
  "steps": [
    {
      "click": ".search-input"
    },
    {
      "waitMs": 300
    }
  ]
},
{
  "label": "Command palette open above the Work board",
  "target": "default",
  "route": "/work",
  "highlight": ".search-overlay",
  "steps": [
    {
      "click": ".search-input"
    },
    {
      "waitMs": 300
    }
  ]
}
]
```

## Activity

- 2026-11-19T13:47:53Z · created · t@t
- 2026-11-19T13:47:56Z · status inbox→ready
- 2026-11-19T13:47:58Z · status ready→active, branch
- 2026-11-19T13:47:58Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T14:04:52Z · note: stopped orphaned engineer pid 91332
- 2026-11-19T14:04:52Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T14:04:52Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T14:04:57Z · needs_input
- 2026-11-19T14:08:42Z · orphaned run process stopped · pid 22268 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun --experimental-import-meta-resolve --require /Users/nick/code · cpu 3s · age 20s
- 2026-11-19T14:10:34Z · body

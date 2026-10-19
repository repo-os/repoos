---
id: "0856"
title: "Allowlist tab: replace the inline agent+model picker with an Add to allowlist modal (choose, then confirm)"
type: feature
status: review
priority: p2
area: web
depends_on: ["0850"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/allowlist-tab-replace-the-inline-agent-m
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-19T15:46:53Z"
updated_at: "2026-10-19T20:13:19Z"
---
## Problem
On the Agents page, Budget Controls -> "Agent+models allowlists for agent drivers" shows an always-visible agent+model picker ("opencode + Big Pickle") with a separate **Add to allowlist** button under it (`src/ui-app/src/components/BudgetControlsPanel.vue`, ~lines 114-131). Because the picker already shows a selected pair, it looks like a status display rather than a form, so it is easy to click Add to allowlist and re-add whatever default is selected, over and over, and then delete the duplicates. The UX is confusing and error-prone.

## Desired UX
- Remove the inline agent+model selector from the allowlist tab entirely. The panel shows the current allowlist rows and a single **+ Add to allowlist** button.
- Clicking **+ Add to allowlist** opens a modal (the shared dialog/drawer components, body-teleported, same styling as other creation dialogs) with two clear parts:
1. **Choose coding agent and model** using the standard styled selector (agent, then its models), with no pre-selected pair, or a clearly empty "Select..." state.
2. **Confirm** with an **Add** button that is disabled until a pair is chosen, plus **Cancel**; X, Esc and click-outside close it.
- A pair that is already on the allowlist cannot be added again: it is marked "already allowed" (disabled) in the selector, or Add refuses with a clear message. After adding, the modal closes, the new row appears (briefly highlighted) and a success toast confirms; the panel never adds anything without an explicit choice and confirmation.
- Works in light and dark themes, at narrow widths, with keyboard focus order (modal focus trap, Enter confirms when valid).

## Acceptance criteria
- Test: the allowlist panel renders no inline agent/model selector; the Add to allowlist button opens the modal; the modal starts with no pair selected and Add disabled; choosing a pair enables Add; confirming adds exactly one row and closes the modal; cancel/Esc/outside click add nothing.
- Test: an already-allowed pair cannot be added twice (disabled option or refusal), and adding via the modal never duplicates a row.
- Shots (use a real fixture and the Agents page route, light and dark): the allowlist tab without the inline picker, and the open modal; open every PNG and check the modal matches other dialogs (shared shell, close button, spacing).
- Uses the shared Dialog components and global form classes (AGENTS.md conventions); no native `<select>`; style.css extended only if a variant is missing.
- Existing tests that reference the old inline picker are updated; behaviour of removing a row and the paused state from #0850 is unchanged.

## Notes for AI
This is the same panel #0850 (pause an agent or model) is changing, so it depends on #0850 and should be started after it lands to avoid conflicts. Start from BudgetControlsPanel.vue; use an existing creation dialog (for example NewDocPanel/NewSkillPanel or the shared dialog in components/ui/dialog) as the pattern. Do not touch repoos.toml. Source: Nick, 2026-10-19 (screenshot attached).

## Screenshots

![Current allowlist panel: inline agent+model selector next to Add to allowlist](/api/tasks/0856/attachments/att_b5eeeed9-fca6-4dc9-a3a4-48e23a6bd6ed.png)

## Shots
```json
[
{
"label": "Allowlist tab (light) — no inline picker",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": "[data-testid=budget-add-open]",
"state": "budget:paused",
"theme": "light"
},
{
"label": "Allowlist tab (dark) — no inline picker",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": "[data-testid=budget-add-open]",
"state": "budget:paused",
"theme": "dark"
},
{
"label": "Add to allowlist modal (light)",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": "[data-testid=budget-add-dialog]",
"steps": [
{
  "click": "[data-testid=budget-add-open]"
},
{
  "waitMs": 300
}
],
"state": "budget:paused",
"theme": "light"
},
{
"label": "Add to allowlist modal (dark)",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": "[data-testid=budget-add-dialog]",
"steps": [
{
  "click": "[data-testid=budget-add-open]"
},
{
  "waitMs": 300
}
],
"state": "budget:paused",
"theme": "dark"
}
]
```

## Activity

- 2026-10-19T15:46:53Z · created · njachowski@gmail.com
- 2026-10-19T15:46:54Z · screenshots
- 2026-10-19T17:01:46Z · status inbox→ready
- 2026-10-19T19:48:20Z · model_override
- 2026-10-19T19:48:22Z · status ready→active, branch
- 2026-10-19T20:00:17Z · body
- 2026-10-19T20:02:18Z · body
- 2026-10-19T20:10:27Z · status active→review
- 2026-10-19T20:13:19Z · note: review pass 1: good to go

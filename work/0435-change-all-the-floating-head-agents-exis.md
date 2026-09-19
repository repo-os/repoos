---
updated_at: "2026-09-19T04:31:48Z"
review_passes: 1
id: "0435"
title: Unify floating head agent panels with tasks/inputs style
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/unify-floating-head-agent-panels-with-ta
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-19T04:24:00Z"
---
## Problem

Floating head agents (Ross, CTO, debugger, and future ones) currently use inconsistent panel styling compared to the side panels for tasks and inputs. This creates visual fragmentation in the UI and means each agent reimplements its own chrome instead of reusing established patterns.

## Desired UX

All floating head agent panels should adopt the same visual style and chrome as the tasks and inputs side panels: consistent width, a close button [x] in the top right corner, and an opaque background overlay that dismisses the panel when clicked anywhere on it (outside the panel content itself).

## Acceptance criteria

- [ ] Ross agent panel uses unified side panel style
- [ ] CTO agent panel uses unified side panel style
- [ ] Debugger agent panel uses unified side panel style
- [ ] All panels have consistent width matching tasks/inputs panels
- [ ] All panels render a close button [x] in the top right corner
- [ ] Opaque background overlay is present and clickable to close
- [ ] Clicking the overlay background closes the agent panel
- [ ] New floating head agents created in the future automatically follow this pattern

## Notes for AI

- Start by identifying where the tasks/inputs side panel is implemented (likely `src/ui-app/src/components/`) and extract its styling/structure into a reusable component if one doesn't already exist.
- The three named agents (Ross, CTO, debugger) should be the primary test cases, but the implementation should be generic enough that future agents inherit this behavior without special work.
- The "opaque background" refers to the semi-transparent overlay that sits behind the panel — clicking it should close the panel, not open/close a dialog.
- Assume the panel width is already a consistent design constant across tasks/inputs; use that same width for agent panels.

## Scope

This task covers visual and interaction styling only. It does not cover agent functionality, content, or behavior — only the presentation layer and dismiss mechanisms of the panel container itself.

## Original prompt

Change all the floating head agents (existing, like Ross, CTO, debugger and any new ones in the future) to use the same style side panel as the tasks and inputs, e.g. it should be the same width with a [x] close button in the top right corner and the opaque background which when clicked also closes the chat panel.

## Activity

- 2026-09-19T04:24:00Z · created · hello@repoos.org
- 2026-09-19T04:24:15Z · status draft→inbox, title, area, body
- 2026-09-19T04:24:48Z · status inbox→ready
- 2026-09-19T04:24:55Z · review_model_override
- 2026-09-19T04:24:56Z · status ready→active, branch
- 2026-09-19T04:29:29Z · status active→review


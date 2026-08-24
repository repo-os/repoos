---
id: "0274"
title: "Debugger/task panel UX: panels hide each other, offer implement fix directly on a diagnosed trivial fix"
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/debugger-task-panel-ux-panels-hide-each-
created_at: "2026-08-24T15:56:54Z"
updated_at: "2026-08-24T19:39:59Z"
---
## Problem
Two related task-panel/debugger UX issues seen on the same run:
1. Clicking "send to debugger" / "fix" from the open task panel opens the debugger panel, but it renders hidden behind the still-open task panel — it was only visible after manually closing the task panel.
2. When the debugger diagnoses a trivial, well-understood fix, the only next step offered is "send repair to engineer," which reads as a step backwards (going back to square one) rather than confidently applying what was just diagnosed. When the debugger is confident and the fix is trivial, the action should read more like "implement fix" (still carried out by the engineer, just framed as continuing forward, not restarting).

## Fix
- Opening the debugger panel should close the task panel automatically (or otherwise ensure the debugger panel is visibly on top / not hidden).
- After clicking to hand a diagnosed fix to the engineer, close the debugger panel and open the task panel automatically so the human can see the engineer working, instead of leaving them looking at a panel that just says "engineer repairing" with no clear next step.
- Reframe the "send repair to engineer" action/copy for the high-confidence trivial-fix case.

## Activity

- 2026-08-24T15:59:47Z · body
- 2026-08-24T19:39:25Z · status inbox→ready
- 2026-08-24T19:39:59Z · status ready→active, branch

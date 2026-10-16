---
id: "0804"
title: "Optional decision-model check before a task starts: should it be split into AI and human tasks?"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p2
area: [server, web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/optional-decision-model-check-before-a-t
created_at: "2026-10-16T05:07:46Z"
updated_at: "2026-10-16T09:06:43Z"
dev_error_count: 1
---
## Problem
The start check flags a task as needing a human step by matching single words in its acceptance criteria (for example 'keys', 'accounts'). That produces false positives: #0803 was stopped at start for the word 'keys' in an agent-doable scope. Word matching can't tell a real human step (a device or a real account) from a word that just appears in the criteria.

## Desired UX
- A setting, off by default, to use the decision model before a task moves to active. The decision model answers one boolean question: does this task contain steps only a human can do, and should it be split into a separate AI task and a human task?
- When the answer is yes, the task is not started. It is flagged with the model's short explanation and the Send to PM action, so the PM can split it. When the answer is no, it starts.
- When the model is off, unavailable, or fails, the existing keyword check runs as before. A failure never blocks a task on its own.
- The setting shows in Settings with plain copy: which provider answers, and what happens on failure.

## Acceptance criteria
- Setting in getConfigSchema() with a Settings control, off by default, with a test (AGENTS.md).
- The decision uses the same provider path as model routing (#0791/#0792). Off mode and shadow mode behave as before, and no task is blocked in shadow mode.
- Tests with fake answers cover: yes flags and explains, no starts, provider failure falls back to the keyword check, and an agent-doable task with the word 'keys' is not flagged when the model says no.
- The flag shows the explanation text on the task card.
- Light and dark themes checked on the flag.

## Notes for AI
Start from the needs-human check on task start (src/core/ or src/server, grep needs-human-step and the keyword match) and the routing provider contract in src/core/model-routing. The decision must stay bounded: a fixed question set, a short explanation, no free-text action from the model. Depends on #0803 for the provider key path. Source: user request 2026-10-16.

## Shots
```json
[
{
  "label": "Decision-model human-step flag on a ready task card",
  "target": "default",
  "route": "/",
  "highlight": ".tc-needs-detail",
  "state": "card:humanStep"
},
{
  "label": "Human-step check setting on the Model routing tab",
  "target": "default",
  "route": "/agents?tab=model-routing",
  "highlight": "[data-testid=routing-human-step-check]"
}
]
```

## Activity

- 2026-10-16T05:07:46Z · created · njachowski@gmail.com
- 2026-10-16T05:40:53Z · status inbox→ready
- 2026-10-16T05:41:28Z · status ready→active, branch
- 2026-10-16T05:48:44Z · message_queued at 2026-10-16T05:48:44.071Z
- 2026-10-16T05:48:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-16T07:09:56Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-16T08:35:43Z · message_expired: not delivered within timeout
- 2026-10-16T08:53:00Z · body
- 2026-10-16T08:54:34Z · body
- 2026-10-16T09:04:29Z · body
- 2026-10-16T09:06:43Z · body: section Shots

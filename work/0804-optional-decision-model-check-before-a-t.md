---
id: "0804"
title: "Optional decision-model check before a task starts: should it be split into AI and human tasks?"
type: feature
status: active
priority: p2
area: [server, web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/optional-decision-model-check-before-a-t
created_at: "2026-10-16T05:07:46Z"
updated_at: "2026-10-16T05:41:28Z"
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

## Activity

- 2026-10-16T05:07:46Z · created · njachowski@gmail.com
- 2026-10-16T05:40:53Z · status inbox→ready
- 2026-10-16T05:41:28Z · status ready→active, branch

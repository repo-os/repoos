---
id: "0101"
title: Run agent review before human sign-off
type: feature
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T16:24:27Z"
updated_at: "2026-08-11T18:14:58Z"
---
## Problem

When a task moves to `review`, the human currently has no agent-generated assessment of the implementation. If the review agent is enabled on the Agents page, it should inspect the completed work first and surface potential bugs, edge cases, and improvement suggestions for the human reviewer.

The review agent must support human sign-off rather than replace it. It must not move the task to `done`.

## Desired UX

When a task enters the `review` state and the review agent is enabled, RepoOS automatically asks the review agent to inspect the task’s code and functionality.

The agent produces a short, readable report covering any bugs, edge cases, or suggestions it finds. The human can read this report while performing the final review and remains responsible for moving the task to `done`.

If the review agent is disabled on the Agents page, moving a task to `review` does not trigger an agent review.

## Acceptance criteria

- [ ] Moving a task into `review` triggers the review agent when that agent is enabled on the Agents page.
- [ ] No agent review is triggered when the review agent is disabled.
- [ ] The review agent checks the implementation’s code and functionality.
- [ ] The review agent looks for bugs and relevant edge cases.
- [ ] The review agent includes useful improvement suggestions when applicable.
- [ ] The review agent writes a short report that is available for the human reviewer to read.
- [ ] The review agent leaves the task in `review` and never moves it to `done`.
- [ ] The human remains responsible for reviewing the task and moving it to `done`.

## Notes for AI

- Preserve the existing human-controlled `review` → `done` workflow.
- Use the review-agent toggle on the Agents page as the source of truth for whether automatic review runs.
- Assume the report may be stored in the task markdown or in a separate `review.md`; choose the option that best fits the existing task and agent architecture.
- Keep the report concise and focused on findings relevant to human sign-off.
- Do not allow the review agent to approve, merge, or complete the task.

## Activity

- 2026-08-11T16:24:27Z · created · unknown
- 2026-08-11T17:34:08Z · status inbox→ready
- 2026-08-11T17:38:09Z · status ready→inbox
- 2026-08-11T17:42:03Z · status inbox→ready
- 2026-08-11T17:42:06Z · status ready→inbox
- 2026-08-11T18:14:55Z · status inbox→ready
- 2026-08-11T18:14:58Z · status ready→inbox

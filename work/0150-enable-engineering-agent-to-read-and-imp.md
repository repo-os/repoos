---
id: "0150"
title: Enable engineering agent to read and implement review recommendations
type: feature
status: ready
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T18:57:27Z"
updated_at: "2026-08-12T18:58:08Z"
---
## Problem

When an engineering agent is working on a task in review state, it cannot access the review agent's comments and recommendations. There's no clear path for the agent to read feedback and implement the suggested changes. This breaks the workflow where a user asks the engineering agent to implement review recommendations.

## Desired UX

An engineering agent working on a task should be able to access and act on review recommendations. When a review is available, the agent should either:
- Automatically receive the review feedback as context in its messages, or
- Have a way to retrieve and read the review comments to implement them

## Acceptance criteria

- [ ] Engineering agent can access review recommendations/comments for a task
- [ ] Review feedback is transmitted to the engineering agent in a consumable format
- [ ] Engineering agent can implement review recommendations based on the feedback
- [ ] The workflow supports: user asks agent to implement review → agent reads review → agent makes changes

## Notes for AI

The user proposed two possible solutions:
1. Store review recommendations in agents.md or task metadata for agent access
2. Add a UI button ("Implement review recommendations") to the review tab that sends the review as a follow-on message to the engineering agent

Explore both approaches. Consider:
- Where review data should be stored/accessed (task context, agents.md, or message-based)
- Whether review should be sent proactively or on-demand
- How to structure review data so the agent understands it clearly
- Whether this should work for tasks in review state, completed reviews, or both

Assume the review contains structured feedback (comments, suggestions) that should be actionable by an agent.

## Related

- Review agent workflow
- Engineering agent task execution
- Task state management

## Activity

- 2026-08-12T18:57:27Z · created · unknown
- 2026-08-12T18:58:08Z · status inbox→ready

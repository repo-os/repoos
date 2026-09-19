---
id: "0440"
title: "Tasks: needs-human-input flag with PM chat Q&A flow"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/tasks-needs-human-input-flag-with-pm-cha
review_model_override: openrouter/tencent/hy4-preview
created_at: "2026-09-19T06:32:07Z"
updated_at: "2026-09-19T07:59:35Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

Some tasks — especially those produced by built-in agents — require human input before an engineer can start. Right now there is no structured way to express this: the task either sits in inbox with vague prose, or the PM has to be explicitly invoked. The human has no clear signal that a task is blocked on their answer, and no convenient place to give it.

## Desired UX

A task can carry a \`needs_input\` flag and a list of questions in its frontmatter:

\`\`\`yaml
needs_input: true
questions:
  - "Should we fix the missing watchdog, or update the doc to reflect launchd KeepAlive instead?"
  - "Is the 5-minute health interval acceptable or should it be configurable?"
\`\`\`

When a human opens such a task in the drawer, the task detail view shows a prominent "Questions for you" section above the body, listing each question. A single button — "Answer these" — opens the PM chat tab pre-loaded with the questions as context, so the PM and human can discuss and arrive at answers. Once the conversation reaches consensus, the PM updates the task body (removing \`needs_input\` and \`questions\` from frontmatter) and sets status to \`ready\`.

## How built-in agents use this

When a built-in agent run produces a task that requires a human decision (e.g. "fix the code or update the doc?"), the agent sets \`needs_input: true\` and includes the specific questions rather than leaving a vague "see findings" body. This gives the human a clear next action and prevents the task from being picked up by the engineer dispatch before the direction is set.

## Acceptance criteria

- [ ] Task frontmatter supports \`needs_input: boolean\` and \`questions: string[]\`
- [ ] Task drawer shows a "Questions for you" card when \`needs_input: true\`, listing each question
- [ ] "Answer these" button opens the PM chat tab with the questions pre-loaded as the opening message
- [ ] PM can clear \`needs_input\` and \`questions\` from a task via the existing PATCH API once answers are incorporated into the body
- [ ] Engineer auto-dispatch skips tasks with \`needs_input: true\` (they are not ready for implementation)
- [ ] Built-in agents can set \`needs_input\` when filing their aggregated task (see task #0439)

## Activity

- 2026-09-19T06:32:07Z · created · unknown
- 2026-09-19T06:40:08Z · review_model_override
- 2026-09-19T06:40:11Z · status inbox→ready
- 2026-09-19T06:40:14Z · status ready→active, branch
- 2026-09-19T07:31:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-19T07:46:01Z · status active→review
- 2026-09-19T07:49:47Z · status review→active
- 2026-09-19T07:59:35Z · status active→review

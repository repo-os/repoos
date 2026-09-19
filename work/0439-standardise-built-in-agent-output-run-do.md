---
id: "0439"
title: "Standardise built-in agent output: run doc + single aggregated task"
type: feature
status: ready
priority: p2
area: ai
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-19T06:31:50Z"
updated_at: "2026-09-19T10:46:28Z"
---
## Problem

Built-in agents (tech-debt, performance, docs-debt, architect, design) have inconsistent output patterns. Some create one inbox task per finding (spam), some save a markdown report to an ad-hoc path, some do both, none produce a reliable fire-and-forget receipt. The human has no way to see what an agent found without watching it run.

## Desired behaviour

Every built-in agent run must produce exactly two things:

### 1. A timestamped run doc

Saved to \`docs/agent-runs/<agent-name>/<ISO-timestamp>.md\`. Contains:
- Agent name, run timestamp, duration, token cost
- All findings with evidence (even if no tasks were created)
- A summary line: "N findings — 1 task created" or "ran clean"

Run docs accumulate; keep the last 10 per agent and delete older ones automatically on each new run.

### 2. Zero or one inbox task

- **Zero tasks** if there are no actionable findings.
- **One task** always — never more than one per run — even when there are multiple findings. All findings go into the single task body as a structured list. If there is genuinely too much work for one task, the task body should describe the findings and say "create subtasks for each of these once the human approves the direction" — the human approves first, then a follow-on agent (or the human) breaks it into subtasks.

This prevents run-spam on the board.

## Notification

Task creation is already a board notification. The run doc appearing in \`docs/agent-runs/\` should also be surfaced somewhere — at minimum a toast or SSE event the UI can show as "Tech Debt agent finished — 3 findings".

## Acceptance criteria

- [ ] All five built-in agents (tech-debt, performance, docs-debt, architect, design) write a run doc to \`docs/agent-runs/<agent>/<timestamp>.md\`
- [ ] Each agent creates at most one inbox task per run, with all findings aggregated into the body
- [ ] Run docs older than the last 10 per agent are pruned on each new run
- [ ] A zero-finding run still writes a run doc ("ran clean") and creates no task
- [ ] The UI surfaces a notification when a run completes (toast or similar)

## Activity

- 2026-09-19T06:31:50Z · created · unknown
- 2026-09-19T10:46:28Z · status inbox→ready

---
id: "0815"
title: "CLI: --assigned-to for repoos new, and human tasks that do not need AI notes"
type: feature
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: real device)"
priority: p1
area: [core, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T05:51:58Z"
updated_at: "2026-10-17T05:51:59Z"
---
## Problem
Creating a task for a human fails from the CLI. `repoos new` only accepts `--ai`, so there is no way to create a human-assigned task in one step (`--assigned-to` is only on `repoos update`). The only workaround is create, then update.

A human task is then also checked against rules written for AI work. Creating one with no `## Notes for AI` section is flagged `needs_input: underspecified` (src/core/task-underspecified.ts), even though no agent will work it. Its acceptance criteria are also checked for human-only steps (`needs-human-step`), which is the expected case for a human task.

## Desired UX
- `repoos new "<title>" --assigned-to ai|human` sets the assignee at creation. `--ai` stays as the short form of `--assigned-to ai`. Other values are refused with a clear error.
- A human task is created with a note in its body that it is for a human, not an AI agent. The `## Notes for AI` section is optional for human tasks and is not required by the underspecified check.
- The underspecified check and the needs-human-step check do not flag tasks assigned to a human. Their acceptance criteria are still shown, since they are the human's checklist.
- `--hold` on `repoos new` keeps working as it does now, so a held human task is created in one command.

## Acceptance criteria
- `repoos new "<title>" --assigned-to human --hold true` creates a held, human-assigned task in one command, with no follow-up update.
- `--assigned-to ai` and `--ai` create an AI-assigned task. An unknown value fails with a message that lists the allowed values.
- A human-assigned task with no `## Notes for AI` section does not get `needs_input: underspecified`.
- A human-assigned task whose acceptance criteria mention a real device or account does not get `needs-human-step`.
- An AI-assigned task with an empty body still gets `underspecified` as before. The rules for AI tasks do not change.
- Tests cover the three assignees (ai, human, default), the unknown value, and the two checks for human and AI tasks.
- docs: user-docs/cli.md documents `--assigned-to` on `repoos new`, and the task-spec docs say that the underspecified and needs-human-step checks skip human-assigned tasks.

## Notes for AI
- The new command flags are parsed in src/commands/tasks.ts (around line 956, where `assignedTo` is set from `flags.ai`). The shared task model is in src/core/repoos.ts (around line 306, where assignee is derived).
- The underspecified rule is src/core/task-underspecified.ts; the flag is applied in src/core/needs-input.ts. Keep the rule for AI tasks unchanged.
- This is the case the maintainer hit when creating a human Flush DNS check (#0111) on the Divot board: the human task was created without a way to assign it in the same command, then flagged as underspecified.

## Activity

- 2026-10-17T05:51:58Z · created · njachowski@gmail.com
- 2026-10-17T05:51:59Z · needs_input

---
id: "0815"
title: "CLI: --assigned-to for repoos new, and human tasks that do not need AI notes"
type: feature
status: active
priority: p1
area: [core, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cli-assigned-to-for-repoos-new-and-human
created_at: "2026-10-17T05:51:58Z"
updated_at: "2026-10-17T06:32:06Z"
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
- `repoos new --human` is the shorthand for `--assigned-to human`, and `--ai` for `--assigned-to ai`. Passing both `--ai` and `--human` fails with a clear error. An unknown `--assigned-to` value fails with a message that lists the allowed values.
- A human-assigned task skips the needs-human-step check entirely, and skips the underspecified check (no `## Notes for AI` required).
- An AI-assigned task that trips the needs-human-step check can be cleared with an explicit override on `repoos new` or `repoos update`, for example `--human-step-override "<reason>"`. The reason is stored in the task and shown in the activity log, so a keyword false positive is cleared on purpose, not by rewording.
- The override is never silent: the check's match is still listed in the task's needs_input detail until the override is set.
- An AI-assigned task with an empty body still gets `underspecified` as before.
- Tests cover `--human`, `--ai`, `--assigned-to`, the unknown value, the skip for human tasks, and the override with its activity entry.
- docs: user-docs/cli.md documents `--human`, `--ai`, `--assigned-to` and the override flag, and the task-spec docs say human-assigned tasks skip these checks.

## Notes for AI
- The new command flags are parsed in src/commands/tasks.ts (around line 956, where `assignedTo` is set from `flags.ai`). The shared task model is in src/core/repoos.ts (around line 306, where assignee is derived).
- The underspecified rule is src/core/task-underspecified.ts; the flag is applied in src/core/needs-input.ts. Keep the rule for AI tasks unchanged.
- This is the case the maintainer hit when creating a human Flush DNS check (#0111) on the Divot board: the human task was created without a way to assign it in the same command, then flagged as underspecified.

## Activity

- 2026-10-17T05:51:58Z · created · njachowski@gmail.com
- 2026-10-17T05:51:59Z · needs_input
- 2026-10-17T05:52:09Z · body: section Acceptance criteria
- 2026-10-17T05:57:56Z · body: section Acceptance criteria
- 2026-10-17T06:12:52Z · status inbox→ready
- 2026-10-17T06:13:34Z · needs_input
- 2026-10-17T06:13:56Z · status ready→active, branch
- 2026-10-17T06:20:28Z · message_queued at 2026-10-17T06:20:28.174Z
- 2026-10-17T06:20:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-17T06:29:28Z · body
- 2026-10-17T06:32:06Z · body

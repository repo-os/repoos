---
id: "1283"
title: "Rule: tasks must get human confirmation before adding new UI nobody asked for"
type: feature
status: ready
priority: p2
area: docs
assigned_to: ai
created_by: t@t
branch: ""
cli_override: claude code
model_override: haiku
created_at: "2026-11-22T03:22:46Z"
updated_at: "2026-11-22T12:27:02Z"
---
## Problem
QA-pass and follow-up tasks have added new user-facing UI that no human asked for (for example the Depends on task picker from #1189 and the desktop Work board search from #1259). It landed silently and the human only noticed later.

## Desired UX
Any task that would add or materially change user-visible UI beyond what its own body explicitly asks for must stop and request human confirmation first, instead of building it. QA passes in particular may fix defects but must file a follow-up proposal for new UI rather than build it.

## Acceptance criteria
- AGENTS.md gets one or two lines stating the rule (keep the file under its size limit); the long version goes in docs/agent-workflow-rules.md with the two examples above.
- The reviewer prompt checks the diff for new UI not named in the task body and reports it as a blocking finding to be confirmed by a human (update tests in default-agent-prompts.test.ts).
- The engineer guidance (default agent prompt text, not repoos.toml) tells engineers to ask via the task's needs-input flow before building unrequested UI.
- QA-pass task templates or docs say: report new-UI ideas as proposals, do not build them.

## Notes for AI
Never edit repoos.toml; if the engineer instructions live there, describe the exact text to add and ask the human to apply it. Prompts stay in one place with tests.

## Activity

- 2026-11-22T03:22:46Z · created · t@t
- 2026-11-22T03:22:51Z · status inbox→ready
- 2026-11-22T12:27:02Z · cli_override, model_override

---
id: "1283"
title: "Rule: tasks must get human confirmation before adding new UI nobody asked for"
type: feature
status: done
priority: p2
area: docs
merged_commit: 26ba68b41bfd4493440cc39cd6e1bac76690ca10
assigned_to: ai
created_by: t@t
branch: feat/rule-tasks-must-get-human-confirmation-b
cli_override: claude code
model_override: haiku
created_at: "2026-11-22T03:22:46Z"
updated_at: "2026-11-22T14:53:03Z"
last_close_out_gate_ms: 1189581
last_close_out_gate_at: "2026-11-22T14:52:29.971Z"
review_passes: 1
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
- 2026-11-22T12:27:03Z · status ready→active, branch
- 2026-11-22T13:06:59Z · body
- 2026-11-22T13:30:47Z · body
- 2026-11-22T13:32:54Z · status active→review
- 2026-11-22T13:32:55Z · message_queued at 2026-11-22T13:32:55.112Z
- 2026-11-22T13:32:55Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-22T13:34:09Z · note: review pass 1: good to go
- 2026-11-22T14:33:54Z · message_overdue: still queued after 60m without being delivered
- 2026-11-22T14:52:29Z · close-out gate completed in 1190s
- 2026-11-22T14:52:59Z · status done→done, release:success
- 2026-11-22T14:53:03Z · message_dropped: 1 queued message(s) discarded — task is done

---
id: "0429"
title: Make automatic skill suggestions evidence-gated and conservative
type: feature
status: review
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/make-automatic-skill-suggestions-evidenc
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-18T18:46:29Z"
updated_at: "2026-09-19T01:19:05Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

The current automatic skill-suggestion pass runs when a task enters review and creates a human inbox task whenever an LLM describes a 'non-trivial, reusable multi-step procedure'. This produced #0424 from #0410: a narrow, unverified CSS workaround that was later shown to be wrong. The queue is becoming noisy, and generated drafts can preserve faulty advice.

## Desired behavior

Treat a reusable skill as a high-bar artifact: a stable procedure useful on future, materially different tasks, with meaningful decisions/branches and evidence it saves repeated investigation. One-off bug fixes, repository-local style rules, test cases, review feedback, and unverified work are not skills.

## Requirements

- Do not run the suggestion pass on transition to review. Evaluate only after a task has genuinely reached done/close-out, with completed verification evidence.
- Default to no suggestion when the evidence is ambiguous. Explicitly reject one-off edits, task-specific checklists, test ideas, local coding conventions, and failed/unverified outcomes.
- Require corroboration from at least two independent completed task sessions, or a clearly stable external tool/API workflow. A single session must never create a human inbox suggestion task.
- Persist first-candidate evidence internally without creating a user-visible task; create at most one suggestion only after corroboration.
- Require every generated draft to state its evidence: the independent source task IDs (or named stable external workflow), the repeatable trigger, and why a test/instruction/task would be insufficient.
- Keep the human approval gate. Do not automatically create live skills.
- Make the setting disabled by default until this stricter gate proves useful; explain the quality bar in the Settings description.
- Add unit and integration coverage for lifecycle timing, rejection cases, corroboration, and no-task-on-single-session behavior.

## Non-goals

- Automatically promoting approved drafts to skills.
- Treating every recurring test or agent instruction as a skill.

## Background

#0424 is the rejected example that motivated this work. It must remain closed; do not revive or promote its draft.

## Activity

- 2026-09-18T18:46:29Z · created · unknown
- 2026-09-18T19:13:32Z · cli_override
- 2026-09-18T19:13:42Z · model_override
- 2026-09-18T19:13:45Z · status inbox→ready
- 2026-09-19T00:38:32Z · cli_override, model_override
- 2026-09-19T00:39:01Z · model_override
- 2026-09-19T00:39:06Z · status ready→active, branch
- 2026-09-19T01:00:00Z · status active→review
- 2026-09-19T01:02:54Z · status review→active
- 2026-09-19T01:19:05Z · status active→review

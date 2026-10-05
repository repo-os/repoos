---
id: "0691"
title: Include the task's story definition and sibling tasks in engineer and reviewer prompts
type: feature
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T17:15:50Z"
updated_at: "2026-10-05T17:15:50Z"
---
## Problem

A task's `story` tag (and the story definition under `stories/`) is used by the board, the story panel and the story's PM chat, but it is NOT part of the prompt an engineer or reviewer receives. Verified in the source (2026-10-06): `.story` is read only by the index/board, `story-pm.ts` and the story PM prompt (`storyPmPrompt`); the repo context digest in `.repoos/context-<id>.json` has no story content; the engineer prompt builder does not mention it. So grouping tasks under a story to give agents the shared background (why the work exists, decisions already made, evidence, sibling tasks) does nothing for the agent doing the work unless the task body itself repeats it.

Found while attaching 21 related tasks to a story that carries the full background of a first real agent-driven project run.

## Desired UX

When a task has a story, the engineer and reviewer prompts include the story's title, a bounded excerpt of its definition (for example the first N KB, plus the path `stories/<file>.md` so the agent can read the rest), and the list of sibling task ids and titles with their statuses. The task drawer shows what was included.

## Acceptance criteria

- Prompt builder for engineer and reviewer roles adds a "Story context" block when `task.story` resolves to a definition; bounded size, omitted when there is no story; unit tests with a long story, a missing definition and a tag-only story (no file).
- The excerpt size is configurable (default a few KB) and recorded in the run header or activity so it is visible what the agent saw.
- Docs: user-docs on stories mention that agents receive this context.
- `repoos check` passes.

## Notes for AI

Look at how the engineer prompt is assembled in `src/server/agents.ts` and how story data is read in `src/core/stories.ts` and `src/core/story-definition-files.ts`. Keep the prompt change small and deterministic. Never hand-edit work/*.md or stories/*.md.

## Activity

- 2026-10-05T17:15:50Z · created · unknown

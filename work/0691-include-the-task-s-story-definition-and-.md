---
updated_at: "2026-10-05T20:42:44Z"
review_passes: 1
id: "0691"
title: Include the task's story definition and sibling tasks in engineer and reviewer prompts
type: feature
status: review
priority: p3
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/include-the-task-s-story-definition-and-
created_at: "2026-10-05T17:15:50Z"
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

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T17:15:50Z · created · unknown
- 2026-10-05T17:17:22Z · story
- 2026-10-05T17:17:23Z · body: section Story context
- 2026-10-05T17:33:09Z · priority
- 2026-10-05T17:33:10Z · note: Owner view (2026-10-06): stories are mostly for the HUMAN to see how tasks relate to each other, so passing the story to agents is a nice-to-have; priority lowered p2 -> p3. A more valuable human-facing improvement may be showing the dependency/relationship view of a story's tasks (and which are done/active/inbox) on the story panel.
- 2026-10-05T19:54:44Z · status inbox→ready
- 2026-10-05T19:54:49Z · status ready→active, branch
- 2026-10-05T20:41:34Z · status active→review
- 2026-10-05T20:41:34Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped


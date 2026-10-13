---
id: "0770"
title: Make the task-file merge rule and staleness fix obvious in AGENTS.md
type: chore
status: review
priority: p2
area: docs
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/make-the-task-file-merge-rule-and-stalen
cli_override: claude code
model_override: haiku
created_at: "2026-10-13T16:18:45Z"
updated_at: "2026-10-13T16:33:56Z"
---
## Problem
Agents hit two avoidable blocks while merging main into a task branch by hand (#0762):
1. A manual git merge stops on a conflict in work/<id>-*.md. RepoOS auto-resolves task-file-only conflicts by taking main's copy (#0754), but that rule only applies inside RepoOS. Agents don't know to take main's copy, so they stop and ask.
2. After the merge, repoos check fails on the staleness step (dist/ older than src/). Fix: run bun run build, then rerun the check. Agents don't know this either.

## Desired UX
AGENTS.md has a short, prominent section (near the top of Rules, or in the Definition of done) saying:
- Conflict in work/<id>-*.md only: take main's copy (git checkout --theirs in the merge), add, commit. Do not stop to ask.
- After merging main, run bun run build before repoos check; a staleness failure means rebuild, not a code problem.

## Acceptance criteria
- Rule text added to AGENTS.md, and the same rule referenced from user-docs/review-and-close-out.md if it covers merge conflicts.
- No behaviour change in the code.

## Notes for AI
Keep it to a few lines. Edit AGENTS.md through a task branch, not on main. Source: #0762 merge session, 2026-10-13.

## Activity

- 2026-10-13T16:18:45Z · created · njachowski@gmail.com
- 2026-10-13T16:20:15Z · cli_override, model_override
- 2026-10-13T16:20:37Z · model_override
- 2026-10-13T16:20:39Z · status inbox→ready
- 2026-10-13T16:20:40Z · status ready→active, branch
- 2026-10-13T16:33:56Z · status active→review

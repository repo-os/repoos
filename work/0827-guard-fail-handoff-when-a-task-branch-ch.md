---
id: "0827"
title: "Guard: fail handoff when a task branch changes repoos.toml (stray settings writes)"
type: bug
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/guard-fail-handoff-when-a-task-branch-ch
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T05:51:14Z"
updated_at: "2026-10-18T06:00:40Z"
---
## Problem
#0822's close-out hit a merge conflict on `repoos.toml` (main: `activityAnimationStyle = "puppy-tracks"`, branch: `"bird-quick-trail"`) and bounced back to the engineer, costing a review cycle. The branch should never have changed `repoos.toml`; a settings save during a shot capture or test most likely wrote the preview/worktree config and a WIP checkpoint committed it.

## Desired UX
At handoff (and again at close-out before the merge), if the task's diff against main touches `repoos.toml` and the task is not explicitly a config task, the handoff fails fast with a message naming the file and the offending lines, and tells the engineer to revert it (`git checkout main -- repoos.toml`). WIP checkpoint commits must not stage `repoos.toml` from a task worktree.

## Acceptance criteria
- Test: a branch diff touching repoos.toml fails handoff with the file named; reverting it passes.
- Test: a task whose paths/title declare config work is exempt.
- Test: checkpoint commits in a task worktree skip repoos.toml.
- docs/close-out-pipeline.md updated in one paragraph.

## Notes for AI
Do not add auto-resolution of repoos.toml conflicts in this task. Source: driver incident 2026-10-18 (#0822). Related: the fixture/config isolation follow-up (do not duplicate it).

## Activity

- 2026-10-18T05:51:14Z · created · njachowski@gmail.com
- 2026-10-18T05:51:39Z · cli_override, model_override
- 2026-10-18T05:52:02Z · status inbox→ready
- 2026-10-18T05:52:13Z · status ready→active, branch
- 2026-10-18T05:56:41Z · body
- 2026-10-18T05:57:48Z · body
- 2026-10-18T06:00:40Z · body

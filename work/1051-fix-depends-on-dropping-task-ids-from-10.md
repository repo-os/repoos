---
id: 1051
title: "Fix depends_on dropping task ids from 1000 up (written unquoted, parsed as number)"
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/fix-depends-on-dropping-task-ids-from-10
created_at: "2026-11-07T07:23:45Z"
updated_at: "2026-11-07T15:27:59Z"
---
## Problem

A dependency on any task id from 1000 up is silently ignored. Found 2026-11-07 on #1050 (`repoos update 1050 --depends-on 1047`): the API reports `dependsOn: []` and `blockedBy: []`, so the dependent would start before #1047 lands, with no error.

Cause (read from the code): `repoos update --depends-on` writes the frontmatter as `depends_on: [1047]`. Ids with a leading zero are written quoted (`["0658"]`), but `1047` has no leading zero, so the YAML writer emits a bare number. `parseTaskDependencies` in `src/core/task-dependencies.ts` only accepts string entries (`typeof id === "string"`), so the number is dropped. `normalizeTaskDependencies` and `validateTaskDependencies` run on the CLI input before it is written, so nothing complains. #1050 is the only task on the board with an unquoted numeric `depends_on` today (every other one is a quoted string such as `"0658"`).

## Desired UX

- A dependency on any id (`0658`, `1047`, `12345`) is always saved in a form that reads back as the same string id, and is enforced (blocked start, "blocked by" shown in the drawer and `repoos list`).
- Existing files with an unquoted numeric id (`depends_on: [1047]`) are read correctly, with no manual edit.

## Acceptance criteria

- `src/core/task.ts` (the `depends_on` write near line 623) always writes ids as quoted strings, or the writer's string quoting covers number-like ids; a round-trip test covers `"0658"`, `"1047"` and a 5-digit id.
- `parseTaskDependencies` accepts numeric entries and returns them as strings zero-padded to the repo's id width (so `1047` and `658` read as `"1047"` and `"0658"`), with tests, so #1050's file works without a rewrite.
- A test proves a task whose `depends_on` was written via the CLI or API for an id >= 1000 is reported as blocked (`blockedBy` contains it) and Start returns the 409 described in `docs/task-dependencies.md`.
- Parse every file in `work/` after the change and confirm the set of dependencies read is unchanged except #1050 gaining `1047` (task file format change: AGENTS.md calls this self-modifying, so a migration or an explicit "no migration needed because the parser is now tolerant" note is part of the change).
- After this lands, #1050's temporary hold (reason mentions depends_on and ids >= 1000) is released by a human or driver.

## Notes for AI

- Start in `src/core/task-dependencies.ts` and the frontmatter writer in `src/core/task.ts` (about line 623). Find where the YAML scalar quoting rule is decided (why `"0658"` is quoted and `1047` is not) and fix that class: check `tags`, `story` and any other string field that can be number-like.
- Do not hand-edit `work/1050-*.md`; the tolerant parser makes it work as is.

## Activity

- 2026-11-07T07:23:45Z · created · njachowski@gmail.com
- 2026-11-07T13:57:25Z · status inbox→ready
- 2026-11-07T14:48:21Z · status ready→active, branch
- 2026-11-07T15:13:45Z · body
- 2026-11-07T15:18:41Z · CTO nudge: held — handoff gate is running
- 2026-11-07T15:25:40Z · status active→review
- 2026-11-07T15:25:40Z · message_queued at 2026-11-07T15:25:40.767Z
- 2026-11-07T15:25:41Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-07T15:27:59Z · note: review pass 1: good to go

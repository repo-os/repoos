---
id: "0786"
title: "Shots: a fixture added on the task branch can't be declared or captured until merge"
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/shots-a-fixture-added-on-the-task-branch
cli_override: claude code
model_override: haiku
created_at: "2026-10-14T16:48:07Z"
updated_at: "2026-10-14T17:26:16Z"
---
## Problem
When a task adds a new preview fixture (a `state` id in src/core/shot-fixtures.ts) and declares a shot that uses it, RepoOS checks the declaration against the fixture list compiled into the control-plane server and CLI (main's build), not the task branch's. Two things break (seen on #0778, 2026-10-14):
1. `repoos update <id> --shots` rejects the entry: `unknown "state" fixture "closeOut:stalled"`. It only worked when run with the CLI built from the task worktree.
2. `repoos verify <id>` and the handoff capture silently skip every entry whose `state` is unknown to main. #0778's verify captured 2 of 6 declared shots and reported "2 shots captured with clean console", with no warning that 4 were dropped. The handoff also skipped capture because older shots already existed.
The preview being captured runs the task branch's code, so the fixture does exist there. Only validation uses the wrong list. Engineers end up declaring a wrong `state` or dropping the shot, and reviewers then say the evidence is missing. That cost #0778 several review rounds.

## Desired UX
- A shot whose `state` exists on the task branch can be declared and is captured at handoff and on verify.
- Any declared shot that is not captured shows a visible warning that names the entry and the reason. Never drop it silently, and never report it as a clean success.

## Acceptance criteria
- Test: a task branch adds a fixture id and declares a shot using it; `--shots` accepts it (validated against the task worktree's fixture list) and the capture plan includes it.
- Test: verify/handoff with a declared entry that cannot be captured records a warning naming it, and the summary counts captured vs declared (for example "2 of 6 captured").
- An id unknown to both main and the branch is still rejected, with the same message as today.

## Notes for AI
Look at where the plan is built (buildCapturePlan / parseShot in src/core/shot-plan.ts, isShotPreviewFixtureId in src/core/shot-fixtures.ts) and the verify path. One option is to read the fixture list from the worktree's source or build instead of the server's own import. Keep the fail-closed behavior for ids unknown everywhere.

## Activity

- 2026-10-14T16:48:07Z · created · njachowski@gmail.com
- 2026-10-14T17:06:45Z · cli_override, model_override
- 2026-10-14T17:06:59Z · status inbox→ready
- 2026-10-14T17:07:03Z · status ready→active, branch
- 2026-10-14T17:15:24Z · body
- 2026-10-14T17:16:18Z · body
- 2026-10-14T17:18:00Z · body
- 2026-10-14T17:24:59Z · status active→review
- 2026-10-14T17:25:00Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-14T17:26:16Z · note: review pass 1: needs some work

---
id: "0199"
title: "Move-to-done is flaky: agent-review test race fails repoos check ~2/3 of runs and the async close-out failure never surfaces in the UI"
type: bug
status: ready
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/fix-flaky-agent-review-test-and-surf
created_at: "2026-08-14T13:02:27Z"
updated_at: "2026-08-14T13:07:52Z"
---
## Activity

- 2026-08-14T13:02:27Z · created · unknown


## Problem

_What's broken or missing? Why does it matter?_

## Desired UX

_What should the end experience be?_

## Acceptance criteria

- [ ] ...

## Notes for AI

_Constraints, files to touch, things NOT to do._

## Activity

- 2026-08-14T13:02:45Z · status inbox→active, branch
- 2026-08-14T13:07:52Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work

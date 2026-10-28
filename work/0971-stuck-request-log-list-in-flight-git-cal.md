---
id: "0971"
title: "STUCK request log: list in-flight git calls and their age"
type: feature
status: inbox
priority: p2
area: core
depends_on: ["0962", "0967"]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-27T22:11:30Z"
updated_at: "2026-10-27T22:11:30Z"
---
## Problem
#0967 landed per-request timing and a STUCK log line, but the STUCK line only names the route and its age; it cannot list the in-flight git calls because the git worker that tracks them lands with #0962.

## Desired UX
A STUCK line names the route, its age, and each in-flight git call with its age, so a freeze can be traced to the slow git command.

## Acceptance criteria
- [ ] Once #0962's git worker is on main, `formatStuckRequest` includes the worker's in-flight calls (command + age); remove the TODO(#0962) in src/server/request-timing.ts.
- [ ] src/ui-app/tests/request-timing.test.ts asserts the git detail with a fake worker.

## Notes for AI
Small. Run only the affected tests; never restart the RepoOS server or request a preview; do not touch repoos.toml.

## Activity

- 2026-10-27T22:11:30Z · created · njachowski@gmail.com

---
id: 1017
title: "Test helper processes leak: days-old repoos-vitest fakebins and stubs stay running and add memory pressure"
type: bug
status: ready
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-03T11:57:42Z"
updated_at: "2026-11-03T12:57:47Z"
---
## Problem
On 2026-11-03 the host was under critical memory pressure (swap churn over the guard limit) and local checks sat queued for 30+ minutes, delaying handoff of #1004 and #1013. `ps` shows dozens of leftover test helper processes, some days old, none doing work:
- `node /tmp/repoos-vitest-*/…/repoos-cli-api-*/bin/opencode run --format json …` (fake opencode CLIs), up to 5 days old
- `bun -e … process.on('SIGTERM', …)` stubs, 5 days old
- `bun …/repoos-preview-req-e2e-*/preview-server.mjs`, 1 day old
- `bun -e … http.createServer …` fixtures, 1 day old
They are reparented to pid 1, so the test run that spawned them is long gone. Each is small, but they add up and point to tests that spawn helpers and never stop them on failure, timeout or abort.

## Desired UX
No test run leaves a helper process behind. After `repoos check` or `bun run test` finishes, passed or failed, nothing it spawned is still alive.

## Acceptance criteria
- [ ] Find which test files spawn these fakebins/stubs/servers (grep `repoos-cli-api`, `repoos-preview-req-e2e`, `process.on('SIGTERM'` stubs in tests) and why they survive (no kill in `afterEach`/`afterAll`, killed only the parent shell, detached spawn, test timeout).
- [ ] Fix them with a shared helper that always kills the spawned process group on teardown, including on failure/timeout.
- [ ] Add a leak guard test or check step: after the suite, no process whose command line contains the run's temp-dir prefix is alive (in the test wrapper `scripts/run-tests.mjs` or a setup hook).
- [ ] Document the rule in `docs/` (where test fixtures are described) and make sure it never kills by process name (see `docs/agent-process-safety.md`).

## Notes for AI
Evidence: `ps -eo pid,etime,command | grep -E 'repoos-vitest|repoos-cli-api|repoos-preview-req'` on the maintainer's machine. Only kill processes you spawned in the test itself, tracked by pid/group, never by name pattern. Do not run the leak guard against other tasks' live engineers.

## Activity

- 2026-11-03T11:57:42Z · created · njachowski@gmail.com
- 2026-11-03T12:57:45Z · status inbox→ready

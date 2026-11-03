---
id: 1017
title: "Test helper processes leak: days-old repoos-vitest fakebins and stubs stay running and add memory pressure"
type: bug
status: active
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/test-helper-processes-leak-days-old-repo
created_at: "2026-11-03T11:57:42Z"
updated_at: "2026-11-03T18:44:14Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-03T18:24:48.985Z: repoos check failed: ui-smoke — timed out — timed out after 300s"
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

PHASE 2 (requested by the maintainer): also add an automatic safety net so leaks cannot accumulate. Home: the stray reaper in `src/server/system.ts` (census table in `docs/agent-process-safety.md`): add a new census kind for leaked test helpers. Run it on a slow timer (every 10-15 min) with its first run a few minutes after boot, not at startup. Never match by process name. Reap (SIGTERM, then SIGKILL via the process group) only when ALL hold: same uid, ppid 1, older than ~30 min, and the command line or cwd is inside a RepoOS-created temp dir (repoos-vitest-*, repoos-cli-api-*, repoos-preview-req-*) or the process carries a REPOOS_TEST_HELPER=<runId> tag set by the test helper, and no live test run still owns that temp dir. Never touch anything under a live task worktree. Log each reap in the system log. Add tests and update docs/agent-process-safety.md.

## Activity

- 2026-11-03T11:57:42Z · created · njachowski@gmail.com
- 2026-11-03T12:57:45Z · status inbox→ready
- 2026-11-03T15:27:13Z · status ready→active, branch
- 2026-11-03T15:33:13Z · body: Notes for AI (added 1)
- 2026-11-03T15:33:14Z · message_queued at 2026-11-03T15:33:14.772Z
- 2026-11-03T15:33:17Z · message_queued at 2026-11-03T15:33:17.515Z
- 2026-11-03T15:37:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T15:47:18Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #1013 check (pid 43807, alive), #1013 check (pid 51511, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 8s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T15:48:03Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T15:48:33Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #1013 check (pid 43807, alive), #1015 check (pid 58891, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 7s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T15:48:48Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T16:19:51Z · body
- 2026-11-03T16:39:53Z · message_overdue: still queued after 60m without being delivered
- 2026-11-03T17:07:42Z · body
- 2026-11-03T17:11:02Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-03T17:11:02Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-03T17:11:02Z · message_delivered: 2 message(s)
- 2026-11-03T17:27:10Z · message_queued at 2026-11-03T17:27:10.717Z
- 2026-11-03T17:27:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T17:27:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T17:37:21Z · body
- 2026-11-03T18:16:28Z · body
- 2026-11-03T18:20:34Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T18:20:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-03T18:20:34Z · message_delivered: 1 message(s)
- 2026-11-03T18:23:47Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 7s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T18:24:48Z · needs_input
- 2026-11-03T18:25:02Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 1m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T18:26:17Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T18:32:09Z · message_queued at 2026-11-03T18:32:09.717Z
- 2026-11-03T18:32:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T18:37:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T18:41:23Z · body
- 2026-11-03T18:44:13Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T18:44:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-03T18:44:14Z · message_delivered: 1 message(s)

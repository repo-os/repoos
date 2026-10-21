---
id: "0859"
title: "Easter eggs bundle: tmp-fixture leak hardening (follow-ups from #0858)"
type: chore
status: active
priority: p3
area: [core, web]
depends_on: ["0858"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-tmp-fixture-leak-hard
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
created_at: "2026-10-20T03:43:18Z"
updated_at: "2026-10-21T06:00:32Z"
dev_error_count: 3
---
## Items

- [x] **E1 · Server teardown survives a browser-close failure** (core) — in the UI smoke and contrast harnesses, close the server in its own `finally` so a throwing `context.close()`/`browser.close()` cannot skip it. Source: #0858 review, 2026-10-20.
- [x] **E2 · Worker-kill reaches nested fixtures deeper than 4 levels** (core) — `killSpawnedLogs` recurses only four levels, so a deeper fixture's child process survives a worker kill. Source: #0858 review.
- [x] **E3 · Test the smoke/contrast "0 new dirs in the real tmpdir" behaviour** (core) — that half of #0858's fix was only hand-verified. Source: #0858 review.
- [x] **E4 · RepoOS Hub opens at its minimum size instead of filling the screen** (macos) — RepoOSHubApp.swift WindowGroup sets only a min frame (880x520) and no default size, so a fresh window opens near that minimum, centered. Give the window a default size that fills the visible screen (use .defaultSize/.windowResizability or size the NSWindow to screen.visibleFrame on first creation, like a browser), keep it resizable, and let macOS frame restore win once the user resizes it.. Source: Nick, 2026-10-20: Hub always opens about 25% of the screen, centered; wants it to open large like a browser..
- [x] **E5 · Docs site (HMR) target fails when user-docs deps are not installed** (core) — The docs preview target (cd user-docs && bun run dev) fails with ERR_MODULE_NOT_FOUND for vitepress-plugin-llms when user-docs/node_modules predates a dependency added to user-docs/package.json (a gitignored install nobody refreshes; fresh task worktrees have none). Make the target run bun install in user-docs first, or have the doctor check flag a missing/stale user-docs install with that fix.. Source: Nick, 2026-10-21: Docs site (HMR) target failed to start; fixed by hand with bun install in user-docs..

Add further small, independent fixes here with `repoos bundle add <id> ...` (one open bundle at a time). Start this bundle after #0858 lands.

## E1 · Server teardown survives a browser-close failure

### Problem
In `src/commands/ui-smoke.ts` and `src/commands/ui-contrast-audit.ts` (via `ui-harness.ts`), if `context.close()` or `browser.close()` throws, `await server.close()` is skipped and the fixture directory is still deleted while the server keeps running. The `port === 0` root-reaper fires `void handle.close()` asynchronously, so the leak can still recur on that narrow failure path. This ordering already existed before #0858; it is a hardening item, not a regression.

### Desired UX
Server shutdown always runs, whether or not browser/context teardown fails, and a teardown error is reported without hiding the original result.

### Acceptance criteria
- Test: with a browser/context `close()` that throws, `server.close()` is still awaited and the fixture dir is removed only after the server is closed.
- Test: when both throw, both errors surface (for example `Promise.allSettled` plus a combined message) and the harness still exits with the right status.

### Notes for AI
Move `await server.close()` into its own `finally`, or run browser and server teardown through `Promise.allSettled`. Keep the harness's exit codes unchanged. Never touch repoos.toml.

## E2 · Worker-kill reaches nested fixtures deeper than 4 levels

### Problem
`killSpawnedLogs` recurses only 4 levels. A fixture nested deeper than that survives a worker kill: its directory is still removed but its child process is not. The review also noticed a comment/Findings line saying "scans one nested level" while the code scans four; fix any such wording that is in the repo.

### Desired UX
A worker kill reaches every spawned fixture process however deep the fixture is nested, or the depth limit is explicit, raised and documented with a reason.

### Acceptance criteria
- Test: a fixture nested deeper than four levels has its child process stopped on worker kill (or the documented new limit is enforced and tested at its boundary).
- Any in-repo comment or doc that says the scan covers one nested level is corrected to match the code.

### Notes for AI
Start from the `killSpawnedLogs` helper added in #0858 (src/ui-app/tests/setup or helpers). Prefer an iterative walk with a generous cap over a small recursion depth. Kill by recorded PID only, never by name. Never touch repoos.toml.

## E3 · Test the smoke/contrast "0 new dirs in the real tmpdir" behaviour

### Problem
#0858 fixed the smoke and contrast harnesses so they no longer leave `repoos-*` directories in the real tmpdir, but that half of the fix was only checked by hand. Nothing will catch a regression.

### Desired UX
A test fails if running the smoke or contrast harness (or its fixture creation path) adds directories to the real tmpdir.

### Acceptance criteria
- Test: run the harness's fixture setup and teardown against a temporary TMPDIR and assert zero new `repoos-*` entries remain, including after a simulated browser-close failure (ties into E1).
- The test runs in the normal suite without needing Playwright (use the fixture helpers or a fake browser).

### Notes for AI
Reuse the tmp-isolation and reap helpers from #0858 (`tmp-isolation.ts`, `global-reap.ts`, `reap-fixtures.test.ts`). Never touch repoos.toml.


## E4 · RepoOS Hub opens at its minimum size instead of filling the screen

### Problem


### Desired UX


### Acceptance criteria

- Test: Unit-test the pure default-size helper (visible frame in, window size out, clamped to the min size) and manually launch the Hub.

### Notes for AI
Implemented as a pure helper ({@link HubWindowDefaults.defaultWindowSize}, 90% of NSScreen.visibleFrame clamped to the 880x520 minimum) used via .defaultSize on the WindowGroup, so macOS frame restoration still wins after the user resizes. Unit tests cover the helper (fill, small-screen clamp, nil-screen fallback); the "manually launch the Hub" half of the criterion is human verification — launch the Hub once after this lands to confirm it opens large.
## E5 · Docs site (HMR) target fails when user-docs deps are not installed

### Problem


### Desired UX


### Acceptance criteria

- Test: Unit-test the check/target setup: with user-docs/node_modules missing or lacking a package.json dependency, the install runs (or the doctor reports it); with everything installed it does nothing.

### Notes for AI



## Problem
Three small, independent follow-ups from #0858's review; see the E-sections.

## Desired UX
No leaked servers or fixture processes after a failed browser teardown or a worker kill, and a test that notices if smoke/contrast leak tmp dirs again.

## Acceptance criteria
See each item's Acceptance criteria (E1, E2, E3); all items must hold.

## Notes for AI
Items are independent; edit them with `repoos bundle edit`, never a full `--body`. Never touch repoos.toml.

## Activity

- 2026-10-20T03:43:18Z · created · njachowski@gmail.com
- 2026-10-20T04:46:48Z · status inbox→ready
- 2026-10-20T08:30:42Z · body: Items (added 1); E4 · RepoOS Hub opens at its minimum size instead of filling the screen (added)
- 2026-10-20T08:30:42Z · note: bundle add E4
- 2026-10-21T02:26:34Z · body: Items (added 1); E5 · Docs site (HMR) target fails when user-docs deps are not installed (added)
- 2026-10-21T02:26:34Z · note: bundle add E5
- 2026-10-21T03:51:01Z · cli_override, model_override
- 2026-10-21T03:51:05Z · status ready→active, branch
- 2026-10-21T04:04:55Z · body
- 2026-10-21T04:07:13Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:07:13Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:08:06Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:09:05Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/deepseek-v4.1-flash) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-21T04:14:52Z · needs_input
- 2026-10-21T04:14:56Z · model_override
- 2026-10-21T04:15:01Z · status active→ready
- 2026-10-21T04:15:05Z · status ready→active
- 2026-10-21T04:15:19Z · body
- 2026-10-21T04:16:03Z · body
- 2026-10-21T04:19:01Z · body
- 2026-10-21T04:22:49Z · body
- 2026-10-21T04:24:11Z · body
- 2026-10-21T04:29:09Z · body
- 2026-10-21T04:35:14Z · CTO nudge: held — machine under pressure (the memory compressor is holding 37% of RAM (9.0 GB of RAM) — holding new work until memory pressure eases)
- 2026-10-21T04:36:35Z · body
- 2026-10-21T04:37:04Z · body
- 2026-10-21T04:44:16Z · body
- 2026-10-21T04:48:42Z · body
- 2026-10-21T04:50:42Z · body
- 2026-10-21T04:51:26Z · body: Items (added 1, removed 1)
- 2026-10-21T04:51:26Z · note: bundle done E1
- 2026-10-21T04:51:26Z · message_queued at 2026-10-21T04:51:26.586Z
- 2026-10-21T04:51:27Z · body: Items (added 1, removed 1)
- 2026-10-21T04:51:27Z · note: bundle done E2
- 2026-10-21T04:51:28Z · message_queued at 2026-10-21T04:51:28.076Z
- 2026-10-21T04:51:29Z · body: Items (added 1, removed 1)
- 2026-10-21T04:51:29Z · note: bundle done E3
- 2026-10-21T04:51:29Z · message_queued at 2026-10-21T04:51:29.470Z
- 2026-10-21T04:51:30Z · body: Items (added 1, removed 1)
- 2026-10-21T04:51:30Z · note: bundle done E4
- 2026-10-21T04:51:30Z · message_queued at 2026-10-21T04:51:30.942Z
- 2026-10-21T04:51:32Z · body: Items (added 1, removed 1)
- 2026-10-21T04:51:32Z · note: bundle done E5
- 2026-10-21T04:51:32Z · message_queued at 2026-10-21T04:51:32.511Z
- 2026-10-21T04:51:43Z · body: E4 · RepoOS Hub opens at its minimum size instead of filling the screen (added 1)
- 2026-10-21T04:51:43Z · note: bundle edit E4
- 2026-10-21T04:51:43Z · message_queued at 2026-10-21T04:51:43.713Z
- 2026-10-21T04:52:06Z · handoff_deferred: 6 queued message(s) must be read before review
- 2026-10-21T04:52:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T04:52:06Z · message_delivered: 6 message(s)
- 2026-10-21T04:58:56Z · body
- 2026-10-21T04:59:28Z · body
- 2026-10-21T05:23:03Z · message_queued at 2026-10-21T05:23:03.486Z
- 2026-10-21T05:23:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T05:39:59Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T05:55:37Z · body
- 2026-10-21T05:55:55Z · body
- 2026-10-21T05:56:10Z · body
- 2026-10-21T05:57:37Z · note: E4 manual check: launched a copy of the built Hub with a fresh bundle id; the window opened at 1485x967 on a 1650x1074 visible frame (90%), and the clamp/no-screen cases are unit-tested. E2: the only remaining 'scans one nested level' wording is in the historical #0858 task record; current code/comments/docs say SPAWN_LOG_SCAN_DEPTH=32 (work files are never hand-edited). Local full bun run test hit timeout flakes under heavy machine load; the changed suites (doctor, reap-fixtures, ui-harness-teardown) pass, and the scoped check incl. remote changed-path tests is green.
- 2026-10-21T05:57:44Z · body
- 2026-10-21T06:00:32Z · handoff_deferred: 1 queued message(s) must be read before review

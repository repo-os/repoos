---
id: "0961"
title: "Bound local load: shared build/test slots for engineers, worker limits, and a pressureGuard that actually blocks starts"
type: feature
status: active
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bound-local-load-shared-build-test-slots
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-25T15:37:17Z"
updated_at: "2026-10-26T19:35:27Z"
---
## Problem

On 2026-10-25 a 10-core, 24 GB Mac with five engineers running reached load 40 to 340, 10 to 12 GB of compressed memory and 0% idle CPU, and the RepoOS server stopped answering HTTP (health checks timed out at 8 to 10 s, the UI would not open, pause/start commands queued for minutes). Each engineer ran 16+ build and test processes at once (`tsc -p`, `vue-tsc --noEmit`, `vite build`, vitest workers, headless WebKit) because the check plan runs build steps and the test suite in parallel and vitest sizes its worker pool to the machine, per engineer. RepoOS's own `pressureGuard` kept reporting "pressure: normal" (for example at load 2.3x per CPU) while the machine was unusable, so it did not stop starts. `repoos stats` showed 5 engineers allowed (`maxConcurrentAgents = 5`).

## Desired behavior

1. A machine-wide local build/test budget: all engineer-run builds and tests on this host share a small number of "heavy slots" (default 2), so five engineers cannot run five parallel build+test stacks. Reuse the existing local check slots (`.repoos/local-check-slots`) and extend them to cover the engineers' own `bun run build*`, `vue-tsc`, `vitest` and `playwright` runs (for example by putting the engineer's shell on a PATH shim, or by setting env limits for engineer processes).
2. Cap parallelism inside one run when launched by an engineer: set `VITEST_MAX_WORKERS` (or the pool size) and Playwright workers from a setting (default 2), and run the check plan's heavy steps sequentially for engineer self-checks.
3. Make `pressureGuard` effective: block new engineer starts and queue heavy steps when the system has little free memory or high compressor use or sustained load far above core count, not only on paging rate. Calibrate against the 2026-10-25 incident numbers (compressor above 8 GB, load above 3x CPU, idle CPU under 5%). Settings UI controls for every new threshold.
4. Report it: the dashboard banner and `repoos stats` show "N heavy jobs running, M queued" and the reason when starts are held.

## Acceptance criteria

- [ ] A test with a fake runner shows 5 engineers' heavy jobs run at most `heavySlots` at a time and the rest queue; a queued job starts when a slot frees; crashed holders release their slot (reuse the dead-holder cleanup from #0921).
- [ ] Engineer processes get a bounded vitest/Playwright worker count from settings (default 2), verified by a test of the spawn environment.
- [ ] `pressureGuard` holds a start when compressor/memory/load limits from the incident are exceeded, with a test using the incident's numbers; the hold reason appears in `repoos stats` and the banner.
- [ ] Settings: `heavySlots`, worker limits and the new pressure limits have UI controls and docs (AGENTS.md rule); `docs/memory-pressure-guard.md` and `user-docs/configuration.md` updated.
- [ ] Measure before/after on a loaded fixture or this machine and record it in the task notes (peak load and process count with 4 simulated engineers).
- [ ] Run every test touching local check slots, pressureGuard, agent spawn and the check runner in small groups, then `repoos check --changed main`.

## Notes for AI
- Do not start a second RepoOS server from a worktree (bug #0954).
- Related: #0958 (fsmonitor re-enable), #0954 (preview servers commit into other worktrees), #0960 (hold). This task is the one that keeps the machine usable when several engineers run.

### Measurement (2026-10-27, this machine)

Fixture, not a compiler storm: 4 simulated engineers, each spawning 8 one-shot `sleep` processes, sharing `.repoos/local-check-slots`.

| Budget | Peak concurrent sleeps | 1-minute load (before → after) |
| --- | --- | --- |
| 4 slots (one stack per engineer) | 32 | 9.11 → 9.11 |
| 2 slots (`heavySlots` default) | 16 | 9.11 → 9.18 |

Load barely moved because the children were `sleep`, not `tsc`/vitest. The cap that matters here is process count: the shared budget cut the concurrent children in half (32 → 16). A five-engineer in-process run of the same semaphore peaked at 2 holders and a killed holder released its slot (see `local-resource-gates.test.ts`).

## Shots
```json
[
{
"label": "Heavy slots and pressure limits in Settings",
"target": "default",
"route": "/settings?tab=general&section=performance",
"highlight": "[data-settings-section=\"performance\"]"
},
{
"label": "Dashboard heavy-job line",
"target": "default",
"route": "/",
"highlight": "[data-heavy-jobs]"
}
]
```

## Activity

- 2026-10-25T15:37:17Z · created · njachowski@gmail.com
- 2026-10-26T18:53:51Z · status inbox→ready
- 2026-10-26T19:01:44Z · status ready→active
- 2026-10-26T19:01:51Z · cli_override, model_override
- 2026-10-26T19:01:51Z · branch
- 2026-10-26T19:02:04Z · message_queued at 2026-10-26T19:02:04.142Z
- 2026-10-26T19:19:58Z · body: Notes for AI (added 7)
- 2026-10-26T19:19:58Z · body
- 2026-10-26T19:19:58Z · message_queued at 2026-10-26T19:19:58.813Z
- 2026-10-26T19:23:29Z · body
- 2026-10-26T19:26:22Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-10-26T19:26:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-26T19:26:22Z · message_delivered: 2 message(s)
- 2026-10-26T19:32:47Z · body
- 2026-10-26T19:35:27Z · body

## TL;DR

Seven orphaned `vitest` processes left behind by finished engineer turns pinned a MacBook at ~6% idle CPU for an hour; six of them ignored SIGTERM and had to be SIGKILLed. Turn teardown only reaped the turn's process group, and agent CLIs' own shell tools can start test runners in new sessions that escape it. This task added two layers: `reapAgentTurnProcessTree` (turn teardown now collects the PID tree, processes whose cwd is in the turn's worktree, and processes carrying a new repo-scoped `REPOOS_TURN_MARKER` env value, sending TERM then KILL to exact PIDs — never name-based kills) and a control-plane sweeper (`run-process-reaper.ts`) running every 15 seconds that finds reparented orphans in managed worktrees, kills them by PID, and reports each kill to the activity log, dashboard, pressure guard and CTO digest. The test-helper sweep `sweepOrphanedRunRootProcesses` is now bounded by a deadline and caps so it cannot hang. One engineering round (opencode-go/deepseek-v4.1-flash), one review pass (verdict: good to go), landed as commit `e48820fc6b52bfd4c08ecaafeebc9b5a71ffc127`.

## Outcome

What shipped:

- **Shared primitive** `src/core/run-processes.ts` (+562): one `ps` sweep parsed into parent-link trees, batched cwd reads (`/proc/<pid>/cwd` on Linux, one `lsof` call on macOS), marker reads from `/proc/<pid>/environ` where the OS allows it. Matching is structural only — PID-tree membership, path-boundary-safe worktree cwd, or an exact checkout-minted marker. No process-name matching anywhere; every kill targets one numeric PID.
- **Turn teardown:** `AgentRunner.finalizeTurn` awaits `reapAgentTurnProcessTree`, which TERMs the turn's group plus escaped PIDs, re-scans once after a grace period (to catch anything that daemonized meanwhile), then KILLs survivors. Agent spawns now carry the repo-scoped `REPOOS_TURN_MARKER`.
- **Control-plane sweeper** `src/server/run-process-reaper.ts` (+192): armed 5s after boot, every 15s, control plane only (preview children and test servers never sweep). Each kill is logged with task id, command, CPU time and age.
- **Observability:** the pressure guard gained `OrphanedRunPressureInfo` (running orphans are a critical reason with PIDs; reaped ones advisory); the System Resources panel shows task id, PID, command, CPU time and age; the CTO digest has its own "Orphaned run processes" section feeding the material-change hash.
- **Bounded test-helper sweep** in `src/ui-app/tests/helpers.ts`: default 5s deadline, row and root caps, a skip for agent-prompt-sized command lines, larger `ps` buffer, and a warning on truncation.
- **Tests:** new `run-processes.test.ts` (+394) and `run-process-teardown.test.ts` (+162, detached setsid grandchild from a fake turn); docs in `docs/agent-process-safety.md` and `user-docs/running-with-agents.md`.

Final verdict: review pass 1 returned **good to go** with no bugs found; the task closed through the close-out gate and landed as `e48820fc6b52bfd4c08ecaafeebc9b5a71ffc127` with release success. UI verification at handoff: 1 of 1 shot captured with a clean console (1 shot warning).

## Process stats

- **Dev rounds:** 1 (round 1 recorded 2026-11-15T19:32:31Z).
- **Review passes:** 1 (2026-11-15T19:34:41Z, verdict good to go).
- **Wall clock, created → done:** 4h 2m 22s (2026-11-15T16:22:52Z → 20:25:14Z, from the recorded timestamps).
- **Agents and models:**
  - Engineer: `opencode` on `opencode-go/deepseek-v4.1-flash` — one session, elapsed 8402s (~2h 20m), 364,482 tokens, cost 0.223392204 (currency units as recorded). No model swaps recorded.
  - Reviewer: `cursor` on `composer-2.5` — one session, elapsed 128s; tokens and cost not recorded.
  - Routing: two Model-router (openrouter) sessions, 1s each, model unknown; tokens and cost not recorded.
- **Close-out gate:** completed in 702s (~11m 42s), finishing at 20:24:55Z; status moved to done at 20:25:14Z. The reason for the gap between the review verdict (19:34:41Z) and the gate start is not recorded.
- **Linked tasks:** none.

## What went wrong

1. **The incident itself:** seven orphaned `vitest`/node processes (ppid 1, 50–70% CPU each, ages 58–78 minutes) from turns of tasks #1128, #1130 and #1131; six ignored SIGTERM and exited only on SIGKILL, after which idle CPU recovered to ~43%.
2. **A two-hour CTO-nudge loop.** The engineer produced no assistant output for essentially its whole session. Between 17:32:09Z and 19:27:11Z, a queued CTO nudge message sat undelivered for ~3 minutes, the running turn was then ended so it could be delivered, and the pattern repeated — 22 turn-ends without a handoff (all exit code 130, "no assistant message"), 23 messages queued and 22 delivered. Work only materialised in the final stretch, with handoff at 19:32:31Z. Nothing in the record explains why the turns were silent; the loop cost most of the engineer's 2h 20m of wall time.
3. **Design iterations:** the first cut relied only on the PID tree and missed grandchildren whose parent had already exited (reparented to PID 1); cwd and the marker were added. A marker-only design was rejected because macOS SIP hides other processes' environments.
4. **macOS `/tmp` symlink bug:** the first integrated live test failed because `lsof` reports `/private/tmp` while the fixture used `/tmp`; fixed by best-effort symlink resolution in `pathInside`.
5. **Flaky remote validation:** the remote host was under heavy load — timeouts in `debugger-integration`, `agent-review` and `remote-host-pool` (all spawn-heavy, untouched by the diff) came and went; all pass in isolation. The full changed suite passed locally: 439 files.
6. **Self-inflicted recurrence:** two local suite attempts without a stable `TMPDIR` failed because RepoOS restarted the agent turn mid-check and removed its `agent-run-tmp` directory, pulling Vite's cache and the UI smoke's `mkdtemp` out from under the running check — the same turn-outlives-its-process bug from the other side. Passing run used a stable `TMPDIR`.
7. **Pre-existing orphans found during work:** the engineer stopped two vitest workers that had been orphaned for three and four days in old task worktrees, by exact saved PIDs.

## Learnings

Durable lessons (the first three are already written into `docs/agent-process-safety.md`, which this task extended):

- **A process group is a lifecycle hint, not a boundary.** Any tool that can call `setsid` escapes it, and once the parent exits the PID tree is gone too. Durable handles must be things the process carries with it — its cwd and its environment — and both need repo scoping so one checkout's sweeper never kills another checkout's live run.
- **Symlink-normalised path comparison matters more than expected on macOS** (`/tmp` → `/private/tmp`).
- **Bounded sweeps are not cosmetic:** one pathological `ps` command line was enough to hang `beforeAll`; every scan needs an explicit deadline and caps.
- **macOS's inability to read another process's environment is a documented tradeoff, not something to work around** with privileged probes; Linux gets both signals, macOS gets tree + cwd.
- **Conservative orphan sweeps need age gates and live-workdir exclusions**, or a cwd-wide scan kills a human's long-lived dev server in a task worktree.

Not yet carried forward anywhere durable (candidate for `docs/agent-workflow-rules.md` or a task): the nudge→turn-end→deliver loop that consumed ~2 hours of this engineer session. When a turn produces no output, ending it to deliver one queued message and immediately queueing another five minutes later repeats indefinitely; the loop needs a backoff or an escalation path.

## Follow-ups

None filed from this task (linked tasks: none recorded). Potential candidates observed in review and development, not yet filed: the unit case the reviewer suggested (stale ppid-1 orphan in a worktree a live turn occupies with a different marker, clarifying intentional deferral vs leak); exposing `processGroupLeader` on `RunningAgentInfo`; the nudge-loop pathology above; and `repoos check` still ending via group reap only (`check-runner.ts`), so detached grandchildren from check are swept asynchronously rather than torn down synchronously.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

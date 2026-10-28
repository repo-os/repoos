# Memory-pressure guard (#0836, #0871, #0961)

RepoOS holds new work when the machine cannot absorb it. This note records why
the guard no longer keys off load average alone, and where each piece lives.

## Why not load average

On 2026-10-20 a laptop hit load 200–500 with CPU idle near zero and swap full.
Most of that load was not RepoOS (Chrome helpers at 80–120% CPU, the Claude app
renderer, WindowServer, a second RepoOS project). Load average counts threads
*queued*, including threads waiting on swap, so it reacts late and cannot say
what is wrong. Engineers simply stalled: gates, reviews and handoffs slowed
until timeouts and retries piled up.

The guard blocks on the machine paying a memory or CPU cost: sustained
swap-in/swap-out or pageout activity, macOS `memory_pressure` reporting
`critical`, low reclaimable memory, Linux PSI, a compressor pool at or above
`pressureGuard.maxCompressorBytes` (default 8 GiB) when no macOS
`memory_pressure` level is available, load above
`pressureGuard.maxLoadPerCpu` (default 3× per CPU), or CPU idle below
`pressureGuard.minIdleCpuPercent` (default 5%). Swap-used ratio and compressor
*ratio* stay advisory: a quiet pool under the byte cap must not block. The
2026-10-25 incident (compressor 10–12 GB, idle CPU near 0, load far above core
count, guard still "normal") is what the byte, idle and load holds are for.

On macOS the compressor size alone is not a pressure signal. macOS compresses
idle apps' pages and keeps them compressed for hours on a quiet machine. On
2026-10-28 an idle 24 GB Mac (92% CPU idle, green Memory Pressure, 43% free)
held every start on 8.03 GB compressed. So when `memory_pressure` reports a
level, that level decides: a pool over the byte cap is only a warning unless
the level is `critical`. The byte cap still blocks where no level is available.

## Signals and thresholds

`src/core/memory-pressure.ts` reads, through a small injectable `MemoryPressureProbe`:

| Platform | Probe | Signal |
| --- | --- | --- |
| macOS | `vm_stat` counter deltas over the activity window | swap-ins, swap-outs and pageouts per second |
| macOS | `memory_pressure -Q`; `sysctl kern.memorystatus_vm_pressure_level` | free percentage and normal/warn/critical pressure level |
| macOS | `vm.swapusage`; `vm_stat` (`Pages occupied by compressor`) | swap used / total and compressor bytes (both advisory while `memory_pressure` reports a level below critical) |
| Linux | `/proc/vmstat` (`pswpin`/`pswpout` deltas) | swap I/O bytes per second |
| Linux | `/proc/pressure/memory` | PSI `some avg10` pressure |
| Linux | `/proc/meminfo` (`SwapTotal`/`SwapFree`) | swap used / total (advisory only) |
| any | `sysmem.availableMemBytes()` | reclaimable memory / RAM |
| any | `os.cpus()` delta | CPU idle percent (block below the idle floor) |
| any | `os.loadavg()` | load per CPU (block above the per-CPU limit) |

`evaluatePressure()` in `src/core/pressure-guard.ts` is pure. A reading set is
`critical` when a blocking signal crosses its threshold:

- `pressureGuard.minAvailableMemRatio` (default 0.08)
- `pressureGuard.minMemoryFreePercent` (default 10, macOS)
- `pressureGuard.maxSwapIoBytesPerSec` and `pressureGuard.maxPageoutBytesPerSec`
- `pressureGuard.maxPsiMemoryAvg10` (Linux)
- macOS memory-pressure level `critical` (`warn` is advisory: macOS stays there
  for hours when the compressor is busy, even with no paging and plenty free)

`pressureGuard.maxSwapUsedRatio` (default 0.5) and
`pressureGuard.maxCompressorRatio` (default 0.35, macOS) only control advisory
warnings. They never block work by themselves. `pressureGuard.maxCompressorBytes`
(default 8 GiB) blocks only when no macOS `memory_pressure` level is available.

`pressureGuard.maxLoadPerCpu` (default 3) holds work whenever load per CPU is
above it. `pressureGuard.minIdleCpuPercent` (default 5) holds when a CPU-time
sample shows less idle than that. A warning does not hold starts; it is visible
in the panel and `repoos stats`. `repoos stats` and the dashboard also show
`N heavy jobs running, M queued` for the shared build/test slots.

## What is held

- Engineer starts (`AgentRunner.spawnOrQueue`) queue with
  `reason: "pressure"` and the computed reason. A 3s retry timer re-drains the
  queue once pressure clears. Running engineers are never killed.
- Local checks (`acquireLocalCheckSlot`) wait before taking a slot.
- Browser steps (`acquirePlaywrightSlot`) wait too — headless WebKit is the
  heaviest thing RepoOS starts on a laptop.

Queue state is also written to `.repoos/queue-markers/` so the task card and
Debug output show the same reason.

## Shared engineer heavy slots (#0961)

Engineer processes receive `VITEST_MAX_WORKERS` (plus `REPOOS_TEST_WORKERS` for
RepoOS's own suite) and Playwright worker limits from Settings, defaulting to 2.
PATH shims for `bun`/`bunx`, `tsc`, `vitest`, `vue-tsc`, `vite build` and
`playwright` route heavy invocations through `~/.repoos/local-check-slots`, one
host-wide pool shared by every checkout and worktree, using `heavySlots`
(default 2). Slot inspection, cleanup, `repoos stats` and the dashboard read that
same pool, so their counts include jobs from other checkouts. An outer build/test
run holds one slot for its whole process tree, so nested tools do not reacquire
or deadlock; the next queued command starts when a holder releases or its dead
process is reclaimed. Direct and Bun-package Vitest invocations receive a
bounded `--maxWorkers` argument; native `VITEST_MAX_WORKERS` also covers Vitest
spawned inside package scripts. `playwright test` receives a bounded `--workers`
argument because Playwright does not define a standard worker environment
variable. The shims resolve RepoOS's own installed wrapper, not a source file in
the managed project.

Known limits:

- **Windows** — the PATH shims need `/bin/sh`, so `installEngineerPathShims`
  returns `null` and engineer shells there get no shared heavy-slot pool; the
  env-var worker caps (`VITEST_MAX_WORKERS`, `PLAYWRIGHT_WORKERS`) still apply.
- **Slot-dir migration** — the pool moved from per-repo
  `.repoos/local-check-slots` to `~/.repoos/local-check-slots`. Holders recorded
  under the old per-repo root are invisible to the new host-wide pool until
  they exit (flock releases when the process dies) or their stale entries are
  reclaimed; the window is one engineer turn after upgrading, not a leak.
- **Package-script worker caps** — `bun run test` in a foreign project reaches
  Vitest only through `VITEST_MAX_WORKERS`/`REPOOS_TEST_WORKERS` in the spawn
  env, which Vitest honours natively; a project whose own config hard-codes
  `maxWorkers` higher is not argv-pinned because RepoOS cannot rewrite its
  package scripts. Direct and `bunx vitest` invocations are argv-pinned.

## Machine-wide engineer cap

`maxConcurrentAgents` is per server. Two RepoOS projects on one laptop each used
to assume the whole machine. Every registered control plane refreshes
`activeEngineers` in `~/.repoos/servers/<port>.json` every 5 seconds
(`updateServerRegistryEngineerCount`). `src/core/global-engineers.ts` reads
those files synchronously in the start path and subtracts the other servers'
live engineers from the local capacity, with a floor of one so a stale count
can never deadlock starts. Only a server that is itself registered applies the
deduction; preview children and ephemeral test harnesses do not.

`repoos servers` shows each entry's engineer count, and `repoos servers --json`
includes `activeEngineers`.

## Remote runners (#0901)

The same thresholds guard remote dispatch. Before leasing a host, the runner
samples its memory pressure (`remoteValidation.healthCheck`, default on) and
skips a host over the limit; if every host is pressured the run queues with the
reason and the OS-specific fix instead of failing the branch's tests. Docker on
macOS reads the Linux VM's `/proc/meminfo` in a probe container, never the Mac's
swap. See `docs/remote-validation.md` (Runner memory health).

## Visibility

`GET /api/system` and the 5s `system.stats` SSE event carry:
- `pressure` — the full snapshot (level, reasons, warnings, swap/compressor
  ratios, source).
- `topProcesses` — `byCpu` and `byMemory` lists across the whole machine, each
  row labeled `repoos` or `other`. A process is RepoOS-owned when it or one of
  its ancestors is the server, a tracked agent, an owned orphan or a known
  preview. Classification never matches a command name, and nothing here kills
  by name.
- `globalEngineers` — own/other counts and the registered servers.

The dashboard's System Resources panel renders the pressure banner, the
machine-wide engineer count, and both top-process lists. `repoos stats` prints
the same summary (and includes it under `system` in `--json`).

## Agent and driver guidance (#0940)

RepoOS's configured `pressureGuard` is the **only** gate for resource-related
start blocking. Agents and board drivers must not invent parallel thresholds
(for example a minimum macOS "free swap" in GB or a `memory_pressure -Q` free %
they chose) or work around a guard hold by starting under a different limit.

- Read RepoOS's verdict: `repoos stats`, the dashboard pressure banner,
  `repoos driver brief`, or a task queue marker with `reason: pressure` and the
  hold message.
- On macOS, `vm.swapusage` "free" is unused swap capacity, not a pressure
  signal. Quiet high swap use and compressor size are advisory while
  `memory_pressure` is below `critical`; compressor *bytes* block at
  `pressureGuard.maxCompressorBytes` only when no level is available.
- Interpret `memory_pressure -Q` free percentage and the guard's pressure
  level against the configured `pressureGuard.*` limits in Settings, not ad-hoc
  numbers.
- When the guard holds a start, report the reason to the human. When the guard
  is disabled or its limits look wrong, ask the human to change Settings — do
  not substitute another gate.

The operating rule lives in `AGENTS.md` (Rules) and is included in
`repoos driver brief` under rules that matter.

## Tests

All pressure tests use fake probes and parsed fixture output — never the real
machine's current pressure. See `src/ui-app/tests/pressure-guard.test.ts`,
`global-engineers.test.ts`, and the top-process parser tests in
`system-resources.test.ts`. The two-checkout, five-process fake-runner and real
resolved-Vitest worker-cap coverage is in `engineer-resources.test.ts`;
slot/dead-holder coverage is in `local-resource-gates.test.ts`; CLI/dashboard
reporting is in `resource-reporting.test.ts`.

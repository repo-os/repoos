# Memory-pressure guard (#0836, #0871)

RepoOS holds new work when the machine cannot absorb it. This note records why
the guard no longer keys off load average alone, and where each piece lives.

## Why not load average

On 2026-10-20 a laptop hit load 200–500 with CPU idle near zero and swap full.
Most of that load was not RepoOS (Chrome helpers at 80–120% CPU, the Claude app
renderer, WindowServer, a second RepoOS project). Load average counts threads
*queued*, including threads waiting on swap, so it reacts late and cannot say
what is wrong. Engineers simply stalled: gates, reviews and handoffs slowed
until timeouts and retries piled up.

The signal that matters is memory reclamation: swap in use and the macOS memory
compressor pool. Both climb while the CPU is idle, and both explain the stall.

## Signals and thresholds

`src/core/memory-pressure.ts` reads, through a small injectable `MemoryPressureProbe`:

| Platform | Probe | Signal |
| --- | --- | --- |
| macOS | `vm.swapusage` | swap used / total |
| macOS | `vm_stat` (`Pages occupied by compressor`) | compressor bytes / RAM |
| macOS | `memory_pressure` | free percentage (display only today) |
| Linux | `/proc/meminfo` (`SwapTotal`/`SwapFree`) | swap used / total |
| any | `sysmem.availableMemBytes()` | reclaimable memory / RAM |
| fallback | `os.loadavg()` | load per CPU when the memory probe is unavailable |

`evaluatePressure()` in `src/core/pressure-guard.ts` is pure. A reading set is
`critical` when any configured limit is crossed:

- `pressureGuard.minAvailableMemRatio` (default 0.08)
- `pressureGuard.maxSwapUsedRatio` (default 0.5)
- `pressureGuard.maxCompressorRatio` (default 0.35, macOS)

`pressureGuard.maxLoadPerCpu` (default 4) holds work **only** when no memory
signal is available; with memory stats it is surfaced as a warning. A warning
does not hold starts; it is visible in the panel and `repoos stats`.

## What is held

- Engineer starts (`AgentRunner.spawnOrQueue`) queue with
  `reason: "pressure"` and the computed reason. A 3s retry timer re-drains the
  queue once pressure clears. Running engineers are never killed.
- Local checks (`acquireLocalCheckSlot`) wait before taking a slot.
- Browser steps (`acquirePlaywrightSlot`) wait too — headless WebKit is the
  heaviest thing RepoOS starts on a laptop.

Queue state is also written to `.repoos/queue-markers/` so the task card and
Debug output show the same reason.

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

## Tests

All pressure tests use fake probes and parsed fixture output — never the real
machine's current pressure. See `src/ui-app/tests/pressure-guard.test.ts`,
`global-engineers.test.ts`, and the top-process parser tests in
`system-resources.test.ts`.

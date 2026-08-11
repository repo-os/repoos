---
id: "0091"
title: "Add a live system resource panel (CPU, memory, per-agent processes) to the Control page"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-a-live-system-resource-panel-cpu-mem
created_at: "2026-08-11T13:49:16Z"
updated_at: "2026-08-11T17:17:29Z"
---
## Problem

RepoOS spawns long-lived agent processes but shows nothing about what they
cost. There is no way, from the UI, to see how much CPU or memory the server
and its agents are consuming, whether the machine is saturated, or whether a
given agent is working hard versus idling. The only way to find out today is
to drop to a terminal and run `ps` by hand.

That blind spot has real consequences, all observed live in one session:

- An agent for `#0069` kept running **3h54m** after its task reached `done`,
  burning CPU the whole time, completely invisible to the board (see 0087).
- A batch of ~8 model-probe processes hung for 43 minutes each; nothing
  surfaced them.
- `GET /api/agents/running` reported **one** agent running while `ps` showed
  **three** — two of them (`#0072`, `#0075`) alive for 1h08m with `PPID 1`,
  meaning they had been orphaned by a server restart and reparented to init.
  They were unkillable through the UI and unattributable to any task.
- Free memory was **0.3 GB of 25.8 GB** while tasks felt inexplicably slow.
  Load average was fine (2.98 on 10 cores) — the pressure was memory, not
  CPU, which is exactly the kind of distinction a readout makes obvious and
  guesswork does not.

The user's mental model of "why is everything slow" currently has no
supporting data, so slowness gets misattributed (e.g. to the choice of model)
instead of to the actual cause.

## Desired UX

A compact resource panel on the Control page (`DashboardView.vue`, "Mission
Control"), sitting alongside the existing stat cards:

- **Headline numbers**: total CPU % and memory used by RepoOS (the `serve`
  process plus every agent it spawned), each shown both as an absolute figure
  and as a share of the machine (e.g. `1.4 GB / 25.8 GB · 5%`). Machine-wide
  free memory and load average are shown too, so the user can tell "RepoOS is
  heavy" from "the machine is busy".
- **A small live chart**: a sparkline of CPU and memory over a rolling recent
  window, updating live, so a climbing trend or a stuck-high plateau is
  visible at a glance.
- **A per-process breakdown**: one row per tracked agent — task id, CPU %,
  memory, elapsed runtime — because the actionable signal is almost always a
  *specific* misbehaving process, not the aggregate.
- **Orphan detection (the highest-value part)**: any agent-looking process
  that is alive but not in the runner's registry — or whose parent is no
  longer the server (`ppid === 1`) — is flagged clearly as orphaned, with its
  PID and runtime. This is what makes the panel diagnostic rather than
  decorative, and it surfaces pre-existing orphans that 0087's fix cannot
  retroactively clean up.

## Acceptance criteria

- [ ] A `GET /api/system` endpoint returns: machine facts (`cpuCount`,
      `totalMem`, `freeMem`, `loadavg`), RepoOS totals (`cpuPercent`,
      `memBytes`, `memPercent`), and a per-process array
      (`{ pid, taskId | null, cpuPercent, memBytes, elapsed, orphaned }`).
- [ ] Stats cover the `serve` process **and** all spawned agent processes —
      not just the server's own `process.memoryUsage()`, which would miss the
      agents entirely and report a misleadingly tiny number.
- [ ] Orphan detection: a live agent process not present in the `AgentRunner`
      registry, or whose `ppid` is no longer the server's pid, is reported
      with `orphaned: true`. Verify against the real case: kill and restart
      `repoos serve` while an agent is running, then confirm the still-live
      agent is reported as orphaned rather than silently dropped.
- [ ] RepoOS-owned process records are the primary attribution source when
      available. A command-name match alone is labelled as an unverified
      candidate and never presented as definitely owned by RepoOS.
- [ ] The panel renders on the Control page with headline CPU/memory (as
      absolute + % of machine), a live sparkline over a rolling window, and
      the per-process table with orphans visually distinct.
- [ ] Updates are pushed over the existing SSE stream as a new event type
      (e.g. `system.stats`) on a sensible interval — **not** a client polling
      loop. The README states the SSE stream is the heartbeat and "no
      polling" is the design intent; follow that.
- [ ] Sampling is cheap: **one** `ps` invocation per interval covering all
      pids at once, never one call per process. The sampler must not become a
      measurable share of the CPU it is reporting on.
- [ ] Sampling stops (or idles to a slow interval) when no SSE client is
      connected — a headless server should not burn cycles measuring itself
      for nobody.
- [ ] Graceful degradation: on a platform where the `ps` invocation is
      unavailable or its flags differ (notably Windows), the endpoint returns
      the `node:os` machine facts with per-process data omitted, and the panel
      hides the unavailable sections rather than rendering `undefined`/`NaN`
      or erroring.
- [ ] Zero new runtime dependencies. `repoos check` passes; zero console
      errors in the UI.

## Notes for AI

- **Data sources, both dependency-free and already proven in this repo:**
  - `node:os` for machine facts — `os.cpus().length`, `os.totalmem()`,
    `os.freemem()`, `os.loadavg()`.
  - `ps -o pid=,ppid=,%cpu=,%mem=,rss=,etime= -p <pid1> <pid2> ...` for
    per-process stats. Shelling out to a system binary is an established
    pattern here — `src/core/git.ts` does exactly this for git — so it fits
    the zero-runtime-deps constraint rather than violating it.
- Agent pids are already tracked: `AgentRunner`'s registry holds
  `entry.proc.pid` per task (`src/server/agents.ts`), and
  `GET /api/agents/running` already exposes `{ id, pid, startedAt }`. Reuse
  that as the authoritative "should be running" set, and diff it against
  what's actually alive to find orphans.
- To discover orphans you need to look beyond the in-memory registry. Prefer a
  persisted RepoOS ownership record containing task id, pid, start time,
  executable, and workdir. Command-pattern matches (`opencode run`, `claude
  -p`, `qwen`, `codex exec`) may identify candidates, but must remain visibly
  unverified so an unrelated human-run process is not misattributed.
- `%cpu` from `ps` on macOS is an average over the process's lifetime, not an
  instantaneous sample — a long-lived process that was busy an hour ago can
  still report a high number. If you want a true instantaneous reading,
  compute a delta between successive samples. Either is acceptable; pick one,
  and make the UI label honest about which it is.
- Chart: hand-roll a small inline SVG polyline over a rolling in-memory
  buffer. Do **not** add a charting library — zero runtime dependencies is a
  hard constraint.
- Keep the history buffer bounded and in-memory only; persisting resource
  history across restarts is explicitly out of scope.
- Likely touch points: a new `src/server/system.ts` (sampler), the SSE
  emitter and route table in `src/server/server.ts`,
  `src/ui-app/src/stores/repo.ts` (consume the new event),
  `src/ui-app/src/types.ts`, `src/ui-app/src/views/DashboardView.vue`, and a
  new component beside `StatCard.vue`.
- Follow the existing test patterns; the sampler's parsing (of `ps` output)
  and the orphan-detection logic are both pure functions and should be unit
  tested against fixture strings rather than live processes.

## Scope

- Covers: the `/api/system` endpoint, the SSE `system.stats` event, the
  sampler, orphan detection, and the Control page panel (headline numbers,
  sparkline, per-process table).
- Deferred: killing or managing processes from the panel (read-only for
  now — 0087 owns lifecycle cleanup), per-task historical resource usage
  persisted across restarts, disk/network metrics, and alerting/notification
  on resource thresholds.

## Related

- 0087 · Release a task's agent process when it leaves active — *prevents*
  orphans; this task *reveals* them, including pre-existing ones 0087 cannot
  retroactively clean up. Complementary, independent, and safe to build in
  either order.
- 0080 · Working animation and live time/tokens/cost counters in the Agent
  tab — adjacent live-telemetry surface; reuse its formatting helpers if it
  has landed, and keep the visual language consistent.
- 0020 · Control-view status cards — the existing Control page layout this
  panel joins.

## Activity

- 2026-08-11T13:49:16Z · created · unknown
- 2026-08-11T14:06:54Z · status inbox→ready
- 2026-08-11T15:37:46Z · updated · make orphan attribution safe against unrelated user processes
- 2026-08-11T17:17:29Z · status ready→active, branch

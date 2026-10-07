---
id: "0729"
title: "Detect and recover hung validation containers on runner hosts (kill, retry on another host, isolate the bun cache per run); CTO safe action"
type: bug
status: ready
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-07T02:05:35Z"
updated_at: "2026-10-07T04:34:35Z"
---
## Problem

On 2026-10-06/07 validation containers hung with the host idle (load about 0), the log looping 'error: Module not found "/repo/node_modules/vitest/dist/workers/forks.js"': thinkpad (container vibrant_grothendieck, 17:36Z, cancelled by hand, container left running) and bee (container jovial_wu, ~23:49Z: the run took 2404 s then failed, container still running 48 minutes later). Probable cause: the shared named volume repoos-bun-cache written by concurrent runs. Nothing detected it; a human noticed.

## Desired UX

- VERIFY FIRST: reproduce or confirm the cause (concurrent writers to repoos-bun-cache) from the run logs and validate.sh.
- A hang detector: a run whose output has not changed for N minutes while the host is idle (configurable, default about 5 min) is killed (docker rm -f of THAT run's container only), recorded as outcome 'hung' with the last log lines, and retried once on another host.
- Per-run (or per-slot) cache isolation so concurrent runs cannot corrupt each other's installs, or a lock around installs; stale containers from finished/cancelled runs are removed when the run ends or at probe time.
- The Remote runners tab shows 'hung' runs and the cleanup.

## Acceptance criteria

- Tests for the detector (idle output + idle host -> kill + retry), for container cleanup on cancel, and for cache isolation. docs/remote-validation.md updated. repoos check passes.

## Notes for AI

Do not touch the owner's hosts from the engineer session. Related: #0717, #0720, #0725.

## Framing (2026-10-07)

The hang recovery (kill that run's container, retry once on another host) is a CTO safe action (#0688 allowlist, rate limited, audited), not new driver logic.

## Activity

- 2026-10-07T02:05:35Z · created · unknown
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:13Z · title, body
- 2026-10-07T04:34:35Z · status inbox→ready

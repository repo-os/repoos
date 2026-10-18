---
id: "0836"
title: Concurrency cap and runner offload for local checks and Playwright runs (with Settings controls)
type: feature
status: ready
priority: p2
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T16:14:25Z"
updated_at: "2026-10-18T16:16:23Z"
---
## Problem
On 2026-10-18 the laptop (24 GB) hit load 60-90 with swap full several times while four tasks were handing off together: 33 `repoos check` processes, 27 bun/vitest processes and 40 Playwright processes at once. Engineers then died with "Connection stalled repeatedly", handoffs were interrupted, and the RepoOS UI showed "Server connection issue". Remote validation already offloads install+build+test to Tailscale runners (docs/remote-validation.md), but the local build, guards, the Playwright UI smoke test, contrast audit, handoff shot capture, UI verification and `repoos shot`/`verify` all run locally, and `remoteValidation.fallbackToLocal = true` fans the full local test suite out when a runner is unreachable.

## Desired UX
Add configurable limits, each with a Settings control (Settings -> General or a Performance group) and a repoos.toml key, with safe defaults:
- `localChecks.maxConcurrent` (default 2): at most N local `repoos check` runs at once; others queue with a visible "waiting for a local check slot" state.
- `playwright.maxConcurrent` (default 1 or 2): one shared semaphore for smoke, contrast audit, shot capture, UI verification and manual shot/verify; queued runs show their position.
- `remoteValidation.offloadBrowserSteps` (default off): run the UI smoke test and shot/verification capture on a runner when one is available (where feasible); otherwise stay local under the cap.
- `remoteValidation.localFallback` mode: `serialize` (default; local fallback runs one at a time), `allow`, or `off`.
- A pressure guard: when load average or swap pressure exceeds a configurable threshold, new checks and engineer starts wait (and the board says why) instead of piling on.

## Acceptance criteria
- Tests: with the cap at 2, a third concurrent `repoos check` waits and then runs; Playwright runs never exceed the configured limit; fallback `serialize` runs one local suite at a time; the pressure guard delays a start and records why.
- Every new key has a Settings UI control with clear copy and a test (AGENTS.md rule), uses the shared styled dropdown and dialogs, and is documented in user-docs/configuration.md and docs/remote-validation.md.
- Queue state is visible on the task card/drawer and in the Debug log; a stuck queue entry times out with an actionable message.

## Notes for AI
Look at src/commands/check.ts, src/server/integration-orchestrator.ts, the shot/ui-verification capture code and docs/remote-validation.md. Do not change the default of existing keys silently; keep the new defaults conservative and explain them. Source: driver incident 2026-10-18 (load 60-90, swap full).

## Activity

- 2026-10-18T16:14:25Z · created · njachowski@gmail.com
- 2026-10-18T16:16:18Z · status inbox→ready
- 2026-10-18T16:16:23Z · cli_override, model_override

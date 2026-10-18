---
id: "0836"
title: Concurrency cap and runner offload for local checks and Playwright runs (with Settings controls)
type: feature
status: active
priority: p2
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/concurrency-cap-and-runner-offload-for-l
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T16:14:25Z"
updated_at: "2026-10-18T18:35:20Z"
review_passes: 5
review_rounds: 2
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

## Shots
```json
[
{
"label": "Performance caps and pressure guard",
"target": "default",
"route": "/settings?tab=general&section=performance",
"highlight": "[data-settings-section=\"performance\"]"
},
{
"label": "Offload browser steps and local fallback",
"target": "default",
"route": "/settings?tab=general&section=remote-validation",
"highlight": "[data-settings-section=\"remote-validation\"]"
}
]
```

## Activity

- 2026-10-18T16:14:25Z · created · njachowski@gmail.com
- 2026-10-18T16:16:18Z · status inbox→ready
- 2026-10-18T16:16:23Z · cli_override, model_override
- 2026-10-18T16:16:24Z · status ready→active, branch
- 2026-10-18T16:23:23Z · body
- 2026-10-18T16:24:16Z · body
- 2026-10-18T16:26:01Z · body
- 2026-10-18T16:26:50Z · body
- 2026-10-18T16:33:11Z · handoff failed · remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T16:38:21Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-18T16:38:22Z · note: handoff requested (cli)
- 2026-10-18T16:47:46Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T16:49:51Z · body
- 2026-10-18T16:52:02Z · body
- 2026-10-18T17:00:21Z · status active→review
- 2026-10-18T17:01:21Z · note: review pass 1: needs some work
- 2026-10-18T17:01:22Z · status review→active
- 2026-10-18T17:05:52Z · body
- 2026-10-18T17:07:31Z · note: handoff requested (ui-review)
- 2026-10-18T17:13:49Z · handoff failed · ui-review handoff failed at check · remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-18T17:21:27Z · message_queued at 2026-10-18T17:21:27.508Z
- 2026-10-18T17:28:35Z · body
- 2026-10-18T17:29:32Z · status active→review
- 2026-10-18T17:29:34Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cebf691f1) during finalization (#0734)
- 2026-10-18T17:29:51Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cebf691f1) during finalization (#0734)
- 2026-10-18T17:31:21Z · note: review pass 2: needs some work
- 2026-10-18T17:31:26Z · message_delivered: 1 message(s)
- 2026-10-18T17:31:29Z · status review→active
- 2026-10-18T17:39:49Z · body
- 2026-10-18T17:42:45Z · body
- 2026-10-18T17:43:55Z · body
- 2026-10-18T17:44:56Z · note: handoff requested (ui-review)
- 2026-10-18T17:45:05Z · body
- 2026-10-18T17:52:06Z · status active→review
- 2026-10-18T17:52:33Z · note: highlight [data-settings-section="performance"] matched nothing on /settings?tab=general&section=performance
- 2026-10-18T17:52:41Z · note: highlight [data-settings-section="remote-validation"] matched nothing on /settings?tab=general&section=remote-validation
- 2026-10-18T17:53:34Z · note: review pass 3: needs some work
- 2026-10-18T17:53:35Z · needs_input
- 2026-10-18T18:05:56Z · status review→active
- 2026-10-18T18:06:06Z · needs_input
- 2026-10-18T18:06:13Z · message_queued at 2026-10-18T18:06:13.856Z
- 2026-10-18T18:09:34Z · body
- 2026-10-18T18:11:43Z · body
- 2026-10-18T18:12:38Z · body
- 2026-10-18T18:14:33Z · body
- 2026-10-18T18:15:12Z · body
- 2026-10-18T18:16:12Z · status active→review
- 2026-10-18T18:17:19Z · note: review pass 4: needs some work
- 2026-10-18T18:17:20Z · needs_input
- 2026-10-18T18:26:18Z · needs_input
- 2026-10-18T18:27:12Z · note: review pass 5: good to go
- 2026-10-18T18:35:12Z · status review→active
- 2026-10-18T18:35:18Z · message_delivered: 1 message(s)
- 2026-10-18T18:35:19Z · status active→review
- 2026-10-18T18:35:20Z · note: handoff requested (cli)

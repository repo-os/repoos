---
id: "0843"
title: "Dev targets: auto-ported services and {service.port} substitution"
type: feature
status: active
priority: p2
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/dev-targets-auto-ported-services-and-ser
cli_override: codex
model_override: gpt-6-luna
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-19T05:12:47Z"
updated_at: "2026-10-20T09:35:56Z"
review_passes: 16
last_check_failure: "repoos check at 2026-10-20T06:48:16.394Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
review_rounds: 2
dev_error_count: 1
---
## Problem
`[[dev.targets]]` supports a single `{port}` for one process, so a full-stack dev target (an API plus a frontend that proxies to it) must pin the API to a fixed port. In the lightingai project the Bun API is pinned to 3001 because the Vite proxy needs to know it, so two copies of the stack, or anything else on 3001, collide. `[[preview.targets]]` already solves this with `[[preview.services]]` and `{api.port}` (#0681), but dev targets have no equivalent. Suggested by the owner (2026-10-19): frontends can already be dynamic, the API should be able to be too.

## Desired UX
A dev target can declare one or more services that RepoOS starts first on auto-picked free ports, and reference their ports in the main command and URL, exactly like preview targets: for example

[[dev.services]]
name = "api"
command = "bun --watch src/server/index.ts"   # reads PORT
healthCheck = { url = "http://localhost:{port}/api/health" }

[[dev.targets]]
name = "app"
kind = "server"
services = ["api"]
command = "bun run dev -- --port {port} --api-port {api.port}"
url = "http://localhost:{port}"

On the Dev page the target shows its services as sub-rows with their own status, real port, PID and output; Start/Stop/Restart on the target starts and stops the services with it, in order. Port clashes get the same plain-language failure summary as today.

## Acceptance criteria
- Config: `[[dev.services]]` rows (name, command, cwd?, port?, autoPort?, healthCheck.url/file, env?) and `dev.targets[].services` (names); unknown or duplicate service names are config errors listed in `devTargetErrors`; documented in user-docs/configuration.md next to the preview services table, including `{<service>.port}` substitution in `command`, `url` and `healthCheck.url`.
- Runtime: services boot before the target, each on its own auto-picked free port (same logic as `{port}` for targets, honoring `port`/`autoPort`), health-gated; if a service fails the target is reported failed with the summary naming the service; stopping or restarting the target stops its services; crash of a service marks the target degraded/failed visibly. Reuse the existing dev-target process manager and the preview-services substitution code rather than duplicating it.
- API and CLI: `/api/dev/targets` includes services and their state; `repoos dev <name> status|logs` can show a service's output (`--service api`). Commands still resolve only from the committed `repoos.toml` (no request body supplies a command).
- UI: Dev page sub-rows for services (status badge, URL/port, PID, collapsible last output), using existing styles; Settings schema/docs exception for TOML-only rows stays documented.
- Tests: config parsing and error cases, port substitution across services, boot order and failure handling with a fake process runner, stop/restart cascades, API shape. `repoos check` passes.
- Declare `## Shots` for the Dev page with a state fixture showing a target plus a service.

## Notes for AI
RepoOS itself; read AGENTS.md first. Start from `parseDevTargets` in `src/core/config.ts`, the dev process manager (grep `dev/targets` in `src/server/routes`), `src/ui-app/src/views/DevView.vue`, and how `[[preview.services]]` (#0681) substitutes `{api.port}`. Keep the zero-runtime-dependency rule. Related bug filed separately: TOML `'''` multi-line literal strings are mis-parsed (stray quotes on the Dev page); do not depend on it.

## Shots
```json
[
{
"label": "Dev target with running companion service",
"target": "default",
"route": "/dev",
"highlight": "[data-test-id=\"dev-services\"]",
"state": "dev:running"
}
]
```

## Activity

- 2026-10-19T05:12:47Z · created · njachowski@gmail.com
- 2026-10-19T08:05:46Z · status inbox→ready
- 2026-10-19T09:41:50Z · model_override
- 2026-10-19T09:41:53Z · model_override
- 2026-10-19T09:41:55Z · status ready→active, branch
- 2026-10-19T09:53:59Z · message_queued at 2026-10-19T09:53:59.706Z
- 2026-10-19T09:53:59Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T11:34:09Z · body
- 2026-10-19T11:35:47Z · body
- 2026-10-19T11:37:34Z · body
- 2026-10-19T11:38:26Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T11:39:41Z · body
- 2026-10-19T11:47:16Z · status active→review
- 2026-10-19T11:47:28Z · note: review pass 1: failed — no usable report
- 2026-10-19T11:47:28Z · needs_input
- 2026-10-19T12:19:11Z · review_cli_override, review_model_override
- 2026-10-19T12:19:14Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-10-19T12:21:29Z · note: review pass 2: needs some work
- 2026-10-19T12:21:29Z · message_delivered: 1 message(s)
- 2026-10-19T12:21:29Z · status review→active
- 2026-10-19T12:27:58Z · message_queued at 2026-10-19T12:27:58.029Z
- 2026-10-19T12:27:58Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T12:29:50Z · body
- 2026-10-19T12:31:36Z · body
- 2026-10-19T12:39:41Z · status active→review
- 2026-10-19T12:39:41Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (5a6c6ddae) during finalization (#0734)
- 2026-10-19T12:39:42Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (5a6c6ddae) during finalization (#0734)
- 2026-10-19T12:41:58Z · note: review pass 3: needs some work
- 2026-10-19T12:41:59Z · message_delivered: 1 message(s)
- 2026-10-19T12:41:59Z · status review→active
- 2026-10-19T12:51:41Z · body
- 2026-10-19T12:53:36Z · body
- 2026-10-19T13:00:56Z · handoff failed · remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T13:06:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-19T13:06:28Z · note: handoff requested (cli)
- 2026-10-19T13:12:37Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T13:17:59Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T13:24:54Z · body
- 2026-10-19T13:26:23Z · body
- 2026-10-19T13:30:05Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails on bee — fix it in the feature branch and re-run the gate. The task stays active — fix the failure and ask again.
- 2026-10-19T13:30:05Z · status active→review
- 2026-10-19T13:30:05Z · note: handoff requested (cli)
- 2026-10-19T13:53:28Z · body
- 2026-10-19T14:01:20Z · body
- 2026-10-19T14:27:08Z · body
- 2026-10-19T14:29:35Z · body
- 2026-10-19T14:30:27Z · status active→review
- 2026-10-19T14:32:58Z · note: review pass 4: needs some work
- 2026-10-19T17:20:55Z · cli_override, model_override
- 2026-10-19T17:21:01Z · model_override
- 2026-10-19T17:21:05Z · needs_input (dev-error) dismissed by hello@repoos.org
- 2026-10-19T17:21:37Z · status review→active
- 2026-10-19T17:21:37Z · note: Bugs src/server/dev.ts:953-978 — stop() does not cancel an in-flight doStart(). If Stop arrives while the first service port is being reserved, there is no target or service process to kill; startup then continues and launches the stack after Stop returned. src/server/dev.ts:744-756 — When the target process crashes, its exit handler marks the target failed but leaves its companion services running. The service can keep consuming resources and holding its port until a later Stop/restart or server shutdown. src/server/dev.ts:520-525 — Distinct service names can normalize to the same placeholder token (for example, api-v1 and api_v1). The implementation silently adds order-dependent suffixes, so the documented {<name>.port} reference can resolve to the wrong service or require an undocumented token.
- 2026-10-19T17:27:04Z · body
- 2026-10-19T17:27:55Z · body
- 2026-10-19T17:29:03Z · body
- 2026-10-19T17:37:42Z · status active→review
- 2026-10-19T17:41:03Z · note: review pass 5: needs some work
- 2026-10-19T17:41:03Z · needs_input
- 2026-10-19T18:25:17Z · body
- 2026-10-19T18:27:00Z · body
- 2026-10-19T18:30:14Z · status review→active
- 2026-10-19T18:36:01Z · message_queued at 2026-10-19T18:36:01.728Z
- 2026-10-19T18:36:02Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T18:40:07Z · body
- 2026-10-19T18:41:00Z · body
- 2026-10-19T18:48:44Z · body
- 2026-10-19T18:53:01Z · status active→review
- 2026-10-19T18:55:31Z · note: review pass 6: needs some work
- 2026-10-19T18:55:32Z · needs_input
- 2026-10-19T18:55:32Z · needs_input
- 2026-10-19T18:59:35Z · status review→active
- 2026-10-19T18:59:38Z · message_delivered: 1 message(s)
- 2026-10-19T19:04:19Z · body
- 2026-10-19T19:05:50Z · body
- 2026-10-19T19:06:34Z · body
- 2026-10-19T19:09:12Z · body
- 2026-10-19T19:14:31Z · status active→review
- 2026-10-19T19:16:29Z · note: review pass 7: needs some work
- 2026-10-19T19:16:29Z · needs_input
- 2026-10-19T19:16:30Z · needs_input
- 2026-10-19T19:17:33Z · status review→active
- 2026-10-19T19:21:23Z · body
- 2026-10-19T19:23:03Z · body
- 2026-10-19T19:23:57Z · body
- 2026-10-19T19:32:55Z · status active→review
- 2026-10-19T19:34:36Z · note: review pass 8: needs some work
- 2026-10-19T19:34:36Z · needs_input
- 2026-10-19T19:34:36Z · needs_input
- 2026-10-19T19:46:59Z · cli_override, model_override
- 2026-10-19T19:47:00Z · model_override
- 2026-10-19T19:47:24Z · status review→active
- 2026-10-19T19:48:47Z · body
- 2026-10-19T19:51:37Z · body
- 2026-10-19T19:53:02Z · body
- 2026-10-19T20:00:41Z · status active→review
- 2026-10-19T20:04:32Z · note: review pass 9: needs some work
- 2026-10-19T20:04:33Z · needs_input
- 2026-10-19T20:04:33Z · needs_input
- 2026-10-20T04:26:25Z · status review→active
- 2026-10-20T04:26:28Z · needs_input
- 2026-10-20T04:30:24Z · body
- 2026-10-20T04:38:20Z · status active→review
- 2026-10-20T04:41:02Z · note: review pass 10: needs some work
- 2026-10-20T04:44:45Z · note: review pass 11: needs some work
- 2026-10-20T04:44:45Z · needs_input
- 2026-10-20T04:46:55Z · status review→active
- 2026-10-20T04:47:04Z · needs_input
- 2026-10-20T04:51:32Z · body
- 2026-10-20T05:17:30Z · message_queued at 2026-10-20T05:17:30.337Z
- 2026-10-20T05:17:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T05:57:38Z · body
- 2026-10-20T06:20:53Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T06:48:08Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-20T06:48:09Z · note: handoff requested (cli)
- 2026-10-20T06:48:13Z · message_queued at 2026-10-20T06:48:13.293Z
- 2026-10-20T07:02:03Z · status active→review
- 2026-10-20T07:05:53Z · note: review pass 12: needs some work
- 2026-10-20T07:05:54Z · needs_input
- 2026-10-20T07:09:06Z · status review→active
- 2026-10-20T07:09:24Z · needs_input
- 2026-10-20T07:09:30Z · message_delivered: 2 message(s)
- 2026-10-20T07:11:00Z · status active→ready
- 2026-10-20T07:11:15Z · status ready→active
- 2026-10-20T07:12:51Z · note: Resuming to fix artifact target companion services remaining alive after successful completion
- 2026-10-20T07:13:31Z · status active→review
- 2026-10-20T07:13:34Z · note: handoff requested (cli)
- 2026-10-20T07:25:43Z · status active→review
- 2026-10-20T07:25:43Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (827b7eeae) during finalization (#0734)
- 2026-10-20T07:25:45Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (827b7eeae) during finalization (#0734)
- 2026-10-20T07:29:30Z · note: review pass 13: needs some work
- 2026-10-20T07:29:33Z · needs_input
- 2026-10-20T07:32:27Z · needs_input
- 2026-10-20T07:32:28Z · status review→active
- 2026-10-20T07:32:28Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T08:09:05Z · message_queued at 2026-10-20T08:09:05.482Z
- 2026-10-20T08:09:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T08:12:27Z · body
- 2026-10-20T08:14:38Z · body
- 2026-10-20T08:17:04Z · body
- 2026-10-20T08:24:58Z · status active→review
- 2026-10-20T08:28:09Z · note: review pass 14: needs some work
- 2026-10-20T08:28:09Z · needs_input
- 2026-10-20T08:28:41Z · needs_input
- 2026-10-20T08:28:42Z · status review→active
- 2026-10-20T08:28:42Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T08:28:42Z · message_delivered: 1 message(s)
- 2026-10-20T08:31:28Z · body
- 2026-10-20T08:38:50Z · body
- 2026-10-20T08:50:21Z · body
- 2026-10-20T08:53:51Z · status active→review
- 2026-10-20T09:01:01Z · note: review pass 15: needs some work
- 2026-10-20T09:02:55Z · note: review pass 16: needs some work
- 2026-10-20T09:02:55Z · needs_input
- 2026-10-20T09:07:44Z · needs_input
- 2026-10-20T09:07:44Z · status review→active
- 2026-10-20T09:07:44Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T09:13:49Z · body
- 2026-10-20T09:16:42Z · body
- 2026-10-20T09:25:09Z · body
- 2026-10-20T09:26:23Z · status active→review
- 2026-10-20T09:28:49Z · note: review pass 17: needs some work
- 2026-10-20T09:28:49Z · needs_input
- 2026-10-20T09:31:19Z · needs_input
- 2026-10-20T09:31:19Z · status review→active
- 2026-10-20T09:31:19Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T09:31:20Z · message_queued at 2026-10-20T09:31:20.475Z
- 2026-10-20T09:33:44Z · handoff failed · remote validation failed: test failure: tests/dev-targets.test.ts > DevTargetManager with services (#0843) > marks an adopted service's crash after reload on the target on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-20T09:35:56Z · message_delivered: 1 message(s)

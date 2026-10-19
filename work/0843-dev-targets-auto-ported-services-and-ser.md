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
model_override: opencode-go/glm-5.3-flash
created_at: "2026-10-19T05:12:47Z"
updated_at: "2026-10-19T19:47:24Z"
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

## Activity

- 2026-10-19T05:12:47Z · created · njachowski@gmail.com
- 2026-10-19T08:05:46Z · status inbox→ready
- 2026-10-19T09:41:50Z · model_override
- 2026-10-19T09:41:53Z · model_override
- 2026-10-19T09:41:55Z · status ready→active, branch
- 2026-10-19T11:47:16Z · status active→review
- 2026-10-19T17:21:37Z · status review→active
- 2026-10-19T17:37:41Z · status active→review
- 2026-10-19T18:30:16Z · status review→active
- 2026-10-19T18:53:01Z · status active→review
- 2026-10-19T18:59:35Z · status review→active
- 2026-10-19T19:14:30Z · status active→review
- 2026-10-19T19:17:33Z · status review→active
- 2026-10-19T19:32:55Z · status active→review
- 2026-10-19T19:47:24Z · status review→active

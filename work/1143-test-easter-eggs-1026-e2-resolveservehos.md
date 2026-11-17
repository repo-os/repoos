---
id: "1143"
title: "Test: easter-eggs #1026 E2 resolveServeHost default fails on machines running Tailscale"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.)"
priority: p3
area: server
assigned_to: ai
created_by: t@t
branch: feat/test-easter-eggs-1026-e2-resolveservehos
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-17T02:10:39Z"
updated_at: "2026-11-17T10:23:41Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-17T10:23:41.275Z\",\"kind\":\"dev-error\"}]"
---
## Problem

`src/ui-app/tests/easter-eggs-1026.test.ts` test "E2: serve banner and resolveServeHost name bind interfaces" asserts `resolveServeHost(undefined).host === "127.0.0.1"`. `resolveServeHost` calls `detectTailscaleIPv4()`, which shells out to `tailscale ip -4`. On any machine where the Tailscale binary is installed and running, the default host resolves to `0.0.0.0` and the test fails. It passed elsewhere only because Tailscale was absent there. Reproduced in isolation on an idle machine (2026-11-17, during task #1126 full-suite run); unrelated to that task's diff (serve.ts / tailscale.ts / the test file are untouched by #1126).

## Acceptance criteria

- [ ] The E2 test passes on a machine with Tailscale installed and running.
- [ ] The test stubs `detectTailscaleIPv4` (both detected and undetected cases) instead of depending on the host machine, and asserts both the localhost-only and the Tailscale-detected `0.0.0.0` default plus banner text.
- [ ] No production code changes; `repoos check` passes.

## Step-by-step guide

1. In `src/ui-app/tests/easter-eggs-1026.test.ts`, spy on or mock `detectTailscaleIPv4` per case.
2. Cover: undetected → `127.0.0.1` + "(localhost only)"; detected → `0.0.0.0` with the "pass --host 127.0.0.1" banner; explicit `--host` always wins.
3. Run the file in isolation, then `repoos check --changed main`.

## Notes for AI

Machine-dependent test, not a product bug: `resolveServeHost` behaviour is intentional (see src/commands/serve.ts lines 74-93). Only the test needs stubbing.

## Activity

- 2026-11-17T02:10:39Z · created · t@t
- 2026-11-17T02:10:40Z · needs_input
- 2026-11-17T02:11:00Z · body: Problem (added 1, removed 1); Acceptance criteria (added 3, removed 1); Step-by-step guide (added); Notes for AI (added 1, removed 1); Desired UX (removed)
- 2026-11-17T08:14:31Z · needs_input
- 2026-11-17T10:23:30Z · cli_override, model_override
- 2026-11-17T10:23:35Z · status inbox→ready
- 2026-11-17T10:23:37Z · status ready→active, branch
- 2026-11-17T10:23:41Z · agent exited with an error (cursor) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.)
- 2026-11-17T10:23:41Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY envir…

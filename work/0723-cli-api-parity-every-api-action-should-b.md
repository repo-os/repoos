---
id: "0723"
title: "CLI/API parity: every API action should be doable from the repoos CLI (start, pause, review, done, message, preview, config, runners, stats)"
type: feature
status: active
priority: p2
area: [cli, server]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/cli-api-parity-every-api-action-should-b
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T14:59:25Z"
updated_at: "2026-10-06T17:21:18Z"
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem

Driving the board overnight on 2026-10-06 needed a hand-rolled curl session (dev-login cookie jar, re-login after every server reload) for everything that matters, because the CLI only covers file-level task edits (list, show, new, update, note, mv, rm). Things the API can do that the CLI cannot: start a task (POST /api/tasks/:id/start, incl. mode=fresh), pause, send an agent a message (POST /message), request review synchronously (PATCH status=review; `repoos mv review` is an async file write the server intercepts and it flaked all night), Move to done (POST /done incl. commitDirty; `repoos mv done` is a status flip that never merges, a documented footgun), per-task agent overrides (PATCH cliOverride/modelOverride; failed silently), preview start/stop, config get/set (PATCH /api/config), remote-runner status and probe (/api/remote-validation/status, /test), running agents (/api/agents/running), board stats/spend (/api/stats/board). Agents and humans on the CLI had to guess curl invocations. Rule going forward: anything the API can do, the CLI can do (the reverse is not required).

## Desired UX

- A short command family that wraps the server API: `repoos start <id> [--fresh]`, `pause <id>`, `message <id> "text"`, `review <id>` (synchronous; waits for and prints the handoff result or the failure reason), `done <id> [--commit-dirty]` (the real close-out pipeline, prints stage progress, refuses like the UI does), `override <id> --cli X --model Y` (verifies and prints the effective agent+model), `preview <id> [--stop]`, `config get|set <key> [value]`, `runners [--probe]`, `agents` (running), `stats`.
- Auth handled once: the CLI reuses a stored session or the dev-login flow for local servers (never prints the code), re-logs in transparently on 401 after a server reload, and fails with a clear message when the server is down. No cookie-jar juggling.
- Every command supports --json. Output of long operations is streamed or pollable, with a --wait flag.
- `repoos mv <id> done` and `mv <id> review` point to the real commands in their help and in the error text.
- A parity guard in the test suite: enumerate registered API routes and fail when a route has neither a CLI command nor an entry in an explicit allowlist of UI-only/internal routes (so parity cannot rot).

## Acceptance criteria

- Tests for each new command against the test server (including 401 re-login and server-down). The route-parity test exists with a reviewed allowlist.
- Docs updated: user-docs CLI reference, AGENTS.md (interactive sessions use the CLI, not curl), docs/. repoos check passes.

## Notes for AI

Read src/commands/tasks.ts and src/cli/ for the command registry and the HTTP route table in src/server/server.ts (router.register calls) for the full API surface. Zero runtime dependencies: use fetch. Related: #0699 (CLI help drift), #0696 (stories CLI). Do not print or log secrets or the dev-login code.

## Activity

- 2026-10-06T14:59:25Z · created · unknown
- 2026-10-06T15:05:35Z · cli_override, model_override
- 2026-10-06T15:05:48Z · status inbox→ready
- 2026-10-06T15:05:55Z · status ready→active, branch
- 2026-10-06T15:12:01Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-06T15:55:45Z · needs_input
- 2026-10-06T17:21:18Z · body

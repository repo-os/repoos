---
id: "0919"
title: "CLI/API parity: every mutating API route gets a CLI command (or an explicit exemption), starting with stop-close-out, plus a generic 'repoos api' escape hatch"
type: feature
status: done
priority: p2
area: [core, server]
merged_commit: aa6a3bddcfff186f04f10ecb090b0c93e3bee09b
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cli-api-parity-every-mutating-api-route-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T04:47:28Z"
updated_at: "2026-10-22T14:01:21Z"
last_close_out_gate_ms: 506168
last_close_out_gate_at: "2026-10-22T14:01:21.354Z"
review_passes: 2
review_rounds: 1
handoff_signal_retry_count: 1
---
## Problem
2026-10-22: stopping an in-flight Move to done had no CLI path. The UI Stop MTD button calls POST /api/tasks/:id/done/cancel (src/server/server.ts line ~3595), and repoos done only starts one. A driver had to write a one-off script around RepoOsApi to cancel it. The server registers about 230 API routes (about 119 of them POST/PATCH/DELETE/PUT) while the CLI has roughly 50 commands and subcommands, so many operations a human or agent driver can click have no CLI equivalent. AGENTS.md tells drivers to 'drive the running server from the CLI, not ad-hoc curl', which only works if the CLI covers what the UI can do. (Auth was not the blocker: the CLI's own client already handles loopback token/stored session; only the missing command was.)

## Desired UX
Anything the UI can do, a driver can do from the CLI with the same one-shot auth. A short, discoverable command exists for each operation (for example repoos done <id> --cancel or repoos abort <id>), and a generic escape hatch lets a driver call any route safely while a proper command does not exist yet.

## Acceptance criteria
- Add repoos done <id> --cancel (same route as Stop MTD) and repoos abort <id> as an alias; prints the HTTP outcome and the 409 'still shutting down' case plainly (see docs/close-out-pipeline.md, #0736).
- Add a generic repoos api <METHOD> <path> [--json body] [--port N] using RepoOsApi auth; refuses non-/api paths and never prints tokens; documented as the escape hatch, not the main interface.
- A parity audit test: enumerate router.register routes (mutating ones at least) and the CLI command table; fail when a mutating route has neither a CLI command nor an entry in an explicit exemption list with a one-line reason; the exemption list starts with the routes that are UI-only on purpose (SSE streams, uploads, OAuth callbacks).
- Fill the first gaps found by the audit that matter for drivers: close-out cancel, review/handoff cancel, runner/host pool inspection and release, integration job inspect/retry, attention events list/dismiss.
- Docs: user-docs/cli.md and AGENTS.md (Interactive / external sessions) list the parity rule and the exemption file.

## Notes for AI
Evidence: route count from grep of router.register in src/server/server.ts and src/server/routes/*.ts; CLI list from repoos --help. Related: #0917 (close-out upload abort and progress), #0897 (queue visibility).

## Activity

- 2026-10-22T04:47:28Z · created · njachowski@gmail.com
- 2026-10-22T05:03:25Z · status inbox→ready
- 2026-10-22T12:30:04Z · cli_override, model_override
- 2026-10-22T12:30:05Z · status ready→active, branch
- 2026-10-22T12:32:44Z · body
- 2026-10-22T12:33:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T12:41:39Z · body
- 2026-10-22T12:44:05Z · body
- 2026-10-22T12:46:20Z · body
- 2026-10-22T12:56:53Z · status active→review
- 2026-10-22T12:56:54Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-22T12:59:57Z · note: review pass 1: needs some work
- 2026-10-22T12:59:58Z · status review→active
- 2026-10-22T13:07:12Z · body
- 2026-10-22T13:09:44Z · body
- 2026-10-22T13:20:49Z · status active→review
- 2026-10-22T13:20:50Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-22T13:22:36Z · note: review pass 2: good to go
- 2026-10-22T14:01:21Z · close-out gate completed in 506s


---
id: "0919"
title: "CLI/API parity: every mutating API route gets a CLI command (or an explicit exemption), starting with stop-close-out, plus a generic 'repoos api' escape hatch"
type: feature
status: inbox
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T04:47:28Z"
updated_at: "2026-10-22T04:47:36Z"
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

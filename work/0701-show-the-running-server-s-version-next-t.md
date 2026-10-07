---
id: "0701"
title: Show the running server's version next to the CLI's and warn when the server is stale
type: feature
status: active
priority: p2
area: [server, cli]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/show-the-running-server-s-version-next-t
created_at: "2026-10-06T03:15:53Z"
updated_at: "2026-10-07T17:28:40Z"
handoff_signal_retry_count: 2
---
## Problem

The tuk-private server had been running for five days (`up 4d 15h (since Oct 1 19:23)`), so none of the ~20 fixes merged on 2026-10-06 applied to it, and nothing said so. `repoos status` in that project repo printed `build ● fresh · repoos v0.5.66 · build time unknown (no dist build — source checkout)`, which reads as if tuk-private were a RepoOS source checkout.

## Desired UX

`repoos status` and the UI show `server: v0.5.66 (build abc123, started Oct 1)` and warn `server is older than the installed CLI — restart to pick up fixes` when they differ.

## Acceptance criteria

- [ ] `GET /api/status` (or the existing health route) reports the server's version and build hash.
- [ ] `repoos status` compares it with the CLI's own build info and prints a warning on mismatch, with the restart command for managed services.
- [ ] The build line is reworded for repos that are not the RepoOS checkout.
- [ ] Tests for match/mismatch output.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 8.

## Activity

- 2026-10-06T03:15:53Z · created · unknown
- 2026-10-06T03:26:52Z · note: Recheck after restarting the tuk-private server on current code: the served page still has repoos-build-hash 'unknown', and repoos status still prints 'no dist build — source checkout' and labels a hand-run terminal serve as 'managed'.
- 2026-10-07T17:10:12Z · status inbox→ready
- 2026-10-07T17:10:14Z · status ready→active, branch
- 2026-10-07T17:28:39Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T17:28:40Z · status review→active

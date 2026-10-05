---
id: "0677"
title: "Board agents (CTO, Ross, debugger) must be read-only; surface 'model unavailable' instead of 'exit code 1'"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:36Z"
updated_at: "2026-10-05T16:58:36Z"
---
## Problem

1. A free-model CTO wrote a junk file named `Nothing to report` into the main checkout (a shell-redirect typo) despite instructions never to edit files. An untracked file on main blocks Move to done ("main has uncommitted file"). It was deleted by hand.
2. The same CTO failed with `opencode exited with code 1: no stderr output`. The real cause, found only by running opencode manually: `Error: Model unavailable: opencode/<free-model>`. Free models come and go; the Agents page Test button also gives unreadable failures (8 s timeout, stream-head truncated to 4 KB; pi+OpenRouter and cursor reported failed/timed out although both worked in real runs).

## Desired UX

- Board-level agents that "never edit" run with no write access to the repo (read-only sandbox/permission mode where the CLI supports it) and/or RepoOS quarantines and reports untracked files created by them instead of leaving main dirty.
- When a CLI exits non-zero with empty stderr, capture stdout/last events and show the actual error ("Model unavailable: ...") in the bell, task and Agents page. Flag a configured model that is currently unavailable.
- Model Test: per-CLI timeout, surface the failing line (not the first 4 KB of stream), distinguish cold start from failure.

## Acceptance criteria

- Test: a board-agent stub that tries to write a file does not dirty main (blocked or quarantined and reported).
- Test: stub CLI exiting 1 with empty stderr and an error on stdout produces that error in the stored failure reason.
- `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:36Z · created · unknown

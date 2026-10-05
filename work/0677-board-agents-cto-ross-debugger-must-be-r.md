---
id: "0677"
title: "Board agents (CTO, Ross, debugger) must be read-only; surface 'model unavailable' instead of 'exit code 1'"
type: bug
status: inbox
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:36Z"
updated_at: "2026-10-05T17:16:49Z"
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

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T16:58:36Z · created · unknown
- 2026-10-05T17:16:48Z · story
- 2026-10-05T17:16:49Z · body: section Story context

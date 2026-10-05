---
id: "0677"
title: "Board agents (CTO, Ross, debugger) must be read-only; surface 'model unavailable' instead of 'exit code 1'"
type: bug
status: review
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/board-agents-cto-ross-debugger-must-be-r
created_at: "2026-10-05T16:58:36Z"
updated_at: "2026-10-05T19:36:15Z"
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

## Notes
## What changed

- **Board one-shot agents are read-only** (`readOnlyCommand` in `src/server/agents.ts`): a new per-CLI builder for board roles that omits every write-enabling flag — opencode without `--auto`, cursor without `--force`, claude without `--dangerously-skip-permissions`, pi with `--tools read`, codex on its default read-only sandbox, agy without the bypass. Where a driver has no read-only mode (copilot `--yolo`, kiro, crush) the command still cannot confine writes; the quarantine net is the backstop there.
- **Stray-file quarantine** (`runBoardAgent` + `quarantineStrayFiles`): snapshots `git status --porcelain -z` before the run, then after it moves any NEW untracked path into `<cacheDir>/quarantine/<timestamp>/` (self-ignoring via a `*` `.gitignore`) and returns the list. Pre-existing dirt — including a user's own untracked files — is never touched. `-z` is used so a path with spaces (the CTO's `Nothing to report`) round-trips unquoted.
- **CTO wired to both** (`src/server/cto.ts`): `run()` and `send()` now call `runBoardAgent`; a quarantine is surfaced in the report body, the session marker, and the run's error reason.
- **Real failure text** (`oneShotFailureDetail`, used by `runPrompt` and `oneShotResultFromLog`): when stderr is empty, the last error-shaped stdout line (or a structured event's `error`/`message`) is used instead of `no stderr output`. A stub CLI exiting 1 with `Error: Model unavailable: …` on stdout now records that line.
- **Model Test** (`src/server/model-test.ts`): per-CLI ceilings (`MODEL_TEST_TIMEOUTS`; cursor/pi 30 s, codex 25 s, …) with the 8 s fallback, the raw stream capture raised from 4 KB to 256 KB so the failing line after a large event dump survives (the old 4 KB cap dropped it — reproduced), and a new `cold_start` status for a timeout with no output. `AgentsView`/`AgentCard`/`types.ts` show `cold start` in amber.

## Verified

- New `src/ui-app/tests/board-agent-safety.test.ts`: stub writes a file → moved to quarantine, `git status` clean, pre-existing untracked file untouched; stub exits 1 with empty stderr and an error on stdout → the error is the stored reason; `readOnlyCommand` drops the write flags per CLI.
- `src/ui-app/tests/model-test.test.ts`: failing line after a 6 KB blob is surfaced; `cold_start` vs `timed_out`; per-CLI ceiling lookup.
- `REPOOS_CHECK_CHANGED=main repoos check` green.

## Story-facts check

The story's facts hold: the CTO ran 91 sessions and wrote the junk `Nothing to report` file into main; the failure text was `no stderr output` with the real cause on stdout. Both reproduce against the current source and are fixed here. The Debugger's zero sessions were a separate toggle issue (not this task).

## Shots
```json
[
  {
    "label": "Agents page: model Test now distinguishes a cold start and names the failing line",
    "target": "default",
    "route": "/agents",
    "highlight": ".agent-test-result"
  }
]
```

## Activity

- 2026-10-05T16:58:36Z · created · unknown
- 2026-10-05T17:16:48Z · story
- 2026-10-05T17:16:49Z · body: section Story context
- 2026-10-05T19:08:00Z · status inbox→ready
- 2026-10-05T19:08:10Z · status ready→active, branch
- 2026-10-05T19:30:52Z · body: section Notes
- 2026-10-05T19:31:27Z · body: section Shots
- 2026-10-05T19:36:15Z · status active→review

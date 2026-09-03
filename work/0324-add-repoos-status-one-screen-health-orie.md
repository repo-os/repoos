---
updated_at: "2026-09-03T18:39:26Z"
review_passes: 2
id: "0324"
title: Add `repoos status` — one-screen health/orientation snapshot for the repo-as-OS
type: feature
status: review
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: feat/add-repoos-status-one-screen-health-orie
review_model_override: openrouter/google/gemini-3.8-flash
created_at: "2026-09-03T17:38:24Z"
review_rounds: 1
---
## Problem

There is no single command that answers "what is the state of this RepoOS
repo right now?". That information is scattered:

- `repoos list` — board only
- `repoos tunnel status` — tunnel only
- the stale-build warning — only fires as a side effect of running some other
  command
- `repoos gc --dry-run` — leaked worktrees
- the web UI — not available from a terminal / over SSH quickly

When something is off (server not up, wrong port, stale build, a stuck
`active` task, a leaked worktree) you currently have to know which of several
commands to run. A `repoos status` — think `git status` for the repo-as-OS —
would collapse that into one screen.

## Proposed solution

`repoos status` (no flags) prints a single screen:

- **Server**
  - running or not; port + PID from `.repoos/serve.lock`
  - **uptime** — `.repoos/serve.lock` already records `startedAt`
    (`src/server/serve-reaper.ts`), so render "up 3h 42m (since 14:02)".
    Fall back to the `/api/health` response if the lockfile is thin.
  - build **fresh vs stale** — hash of `src/` vs `dist/.build-info.json`
    (same check `repoos` already does); show this prominently, it is the #1
    time-waster in this repo per AGENTS.md
  - RepoOS version (`dist/.build-info.json`) and whether an upgrade is
    available if that is cheap to check
- **Board** — count per column; list `active` tasks with their branch,
  worktree path, and last-activity timestamp so a stuck-`active` task is
  obvious at a glance
- **Worktrees** — count vs `worktreeWarnThreshold`; anything `gc` would
  consider leaked (done/absent task, integrate candidate)
- **Tunnel** — one line: configured? running? published hostnames (or
  "not configured")
- **Git** — current branch, clean/dirty, ahead/behind `main`

`repoos status --json` — machine-readable, mirroring `repoos index --json`,
for agents/tooling.

Must work **when the server is not running**: read `.repoos/serve.lock`, the
build marker, `work/*.md` (or the index cache), and `git` directly rather
than requiring `/api/health`. When the server IS up, enrich from
`/api/health` + the tunnel readiness endpoint.

## Acceptance criteria

- [ ] `repoos status` with the server stopped prints server=stopped, the
      board summary, worktree/tunnel/git lines — no crash, no hang.
- [ ] `repoos status` with the server running shows port, PID, and a
      human-readable uptime derived from the lockfile `startedAt`.
- [ ] Stale build is called out unmissably (not a quiet footnote).
- [ ] `active` tasks are listed with branch + worktree path + last activity;
      a task whose worktree is missing is flagged.
- [ ] Leaked-worktree count matches `repoos gc --dry-run`.
- [ ] Tunnel line matches `repoos tunnel status`' top-level state.
- [ ] `--json` emits a stable documented shape; covered by a test.
- [ ] Output rendering + the server-down path are unit tested (fixture repo,
      fake lockfile, stale vs fresh marker).
- [ ] Zero new runtime dependencies.
- [ ] `repoos --help` COMMANDS list + `docs/` updated.

## Notes / pointers

- `.repoos/serve.lock` shape and `startedAt`: `src/server/serve-reaper.ts`
  (~line 25 interface, ~line 342 write).
- Build staleness: whatever `repoos` already uses to print the stale warning
  (hash of `src/` vs `dist/.build-info.json`).
- Board/active data: the index snapshot (`repoos index`) or `work/*.md`
  parse; `/api/health` returns `taskCount` + build info.
- Tunnel: `tunnelReadiness` in `src/server/server.ts` /
  `/api/tunnel/readiness`.
- Worktree leak logic: `repoos gc` (`src/commands/`), `worktreeWarnThreshold`
  in `repoos.toml`.
- CLI dispatch: `src/cli/index.ts`; command lives under `src/commands/`.
- Consider sharing a formatter with `repoos tunnel status` for the one-line
  tunnel summary.

## Activity

- 2026-09-03T17:38:24Z · created · unknown
- 2026-09-03T17:41:46Z · status inbox→ready
- 2026-09-03T17:41:55Z · status ready→active, branch
- 2026-09-03T17:51:15Z · review_model_override
- 2026-09-03T18:17:06Z · status active→review
- 2026-09-03T18:23:44Z · status review→active
- 2026-09-03T18:33:39Z · status active→review


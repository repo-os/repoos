---
id: "0584"
title: "Show repo git state (branch, clean/dirty, recent commits) in the sidebar"
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/show-repo-git-state-branch-clean-dirty-r
model_override: opencode-go/mimo-v2.6-flash
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-29T11:44:56Z"
updated_at: "2026-09-29T20:10:31Z"
---
## Problem

To know whether the main checkout is clean and still on `main`, the user drops to a terminal and runs `git status` (and `git log`). That state matters a lot here: a dirty `main` blocks close-out (dirty-main guard, #0204), and a checkout that is not on `main` is a footgun. The information is only reachable from the Context page's History tab, and dirtiness is not shown anywhere until a close-out fails.

## Goal

Always-visible git state for the repo root checkout in the persistent left sidebar, kept live.

## Design

### Sidebar row

- In `Sidebar.vue`'s `side-foot` card, below the `events` row, add a row: `(branch icon) main` on the left, `clean` / `dirty` on the right, and a small info icon.
- Branch label is the current branch of the repo root checkout (`git rev-parse --abbrev-ref HEAD`). If it is not the configured base branch (usually `main`), or HEAD is detached, style it as a warning; that is the "double check I'm still on main" case.
- `clean` is neutral; `dirty` is a warning color with the changed-file count. Use theme tokens, and check contrast in all three sidebar themes (Jelly, Gruvbox, Catppuccin) since the repo has a theme-contrast guard.
- An unknown state (git status timed out or errored) shows `unknown`, never `clean`. Fail closed, as `dirtyFiles` already does (#0211).

### Hover popup

- The info icon opens a popover on hover and on keyboard focus/click (must work for touch and keyboard, not hover only). Body-teleported with `data-overlay-layer="floating"` per AGENTS.md, and it must not be clipped by the sidebar.
- Contents: if dirty, the list of changed files with their status letters (modified, added, untracked, ...), capped with "+N more". Always: the 3 most recent commits on the checked-out branch (subject, short sha, relative time, author initials), the same data and look as the Context History tab. A "View history" link goes to `/repo` History.
- Reuse the existing data path instead of new git plumbing where possible: `listRepoLog` (`src/core/repo-log.ts`, `GET /api/repo/log`) for commits, and the status parsing behind `dirtyFiles` (`src/core/git.ts`) for changed files. Extend `dirtyFiles`' parser to also return the status column rather than duplicating it.

### Staying up to date (the key requirement)

A stale "clean" is worse than no indicator. So:

- **Server-owned single source of truth.** One server function computes `{ branch, detached, dirty: [{path, status}], head, recentCommits, computedAt }` for the repo root, and a small `GET /api/repo/status` returns it. Debounce and coalesce concurrent calls so the sidebar on every open tab never fans out into many `git status` processes (this repo's `git status` already has a 4s budget and has been a source of load).
- **Push, don't only poll.** Emit a change over the existing SSE stream when state changes. Triggers: (1) the working-tree watcher already in `src/server/watcher.ts` (it skips dot-directories, so add `.git/HEAD` and the refs and index files explicitly for branch switches, commits and staging); (2) after every RepoOS-initiated commit or merge (`commitTaskFile`, close-out publish, `sync_with_base_branch`, checkpoint commits), since those change `main` without necessarily tripping a file event. Only emit when the computed state actually differs, to avoid churning the event counter.
- **Backstops.** Refetch on window focus / tab visibility, on SSE reconnect, and on a slow fallback interval (e.g. 30-60s) while visible. Show a subtle "checked N s ago" in the popup, and treat data older than a threshold as `unknown`.
- **Scope.** The row describes the repo root checkout only, not task worktrees (their branches share `.git` but have their own working trees, and a task branch moving must not flip the main indicator). Label it so it is unambiguous, e.g. the popup header says which path is being described.
- **Noise.** RepoOS itself commits `docs(<id>): ...` task-file changes constantly, so `dirty` may flicker briefly between a file write and its commit. Debounce the transition to `dirty` (a couple of seconds) so normal RepoOS activity doesn't strobe the indicator, while a real uncommitted change still shows up.

## Out of scope

Committing, stashing, or switching branches from the popup (read-only for now); per-worktree status; ahead/behind remote counts (could follow).

## Acceptance criteria

- [ ] Sidebar shows branch and clean/dirty (with count) for the repo root checkout, on every page, below `events`.
- [ ] Non-base branch or detached HEAD is visibly warned; unknown state never displays as clean.
- [ ] Info popup lists changed files when dirty and always shows the 3 most recent commits, reusing the History tab's data/format; works with hover, keyboard focus and touch; layered per the overlay rules.
- [ ] State updates without a page refresh after: an external `git commit`, `git checkout`, editing/staging a file, and a RepoOS-driven commit or close-out. Covered by tests for each trigger.
- [ ] Server coalesces status computation; N open clients do not spawn N git processes; changes emit only when the state differs.
- [ ] Focus/visibility/reconnect refetch and the fallback interval exist; stale data degrades to `unknown`.
- [ ] Works in all three sidebar themes (contrast guard passes); no new runtime dependency; docs in `user-docs/` updated.

## Activity

- 2026-09-29T11:44:56Z · created · unknown
- 2026-09-29T16:46:52Z · model_override
- 2026-09-29T16:46:58Z · review_model_override
- 2026-09-29T16:46:59Z · status inbox→ready
- 2026-09-29T16:47:00Z · status ready→active, branch
- 2026-09-29T17:59:48Z · status active→review
- 2026-09-29T20:10:31Z · status review→done, release:success

---
id: "0514"
title: Add git History tab to the Context page
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-26T05:57:03Z"
updated_at: "2026-09-26T05:58:12Z"
---
## Goal

Add a UX-friendly **git log / History view** to the RepoOS UI, so a human can see "what changed and when" in the repo without leaving the app.

## Where it goes (decision already made)

A new **History** tab on the **Context** page (`/repo`, `src/ui-app/src/views/ContextView.vue`), alongside the existing `Docs | Skills | Discover` tabs (`type ContextTab`, `.ctx-tabs`). Not a new top-level nav item.

Rationale:
- Context is already "the repo itself" (docs, AGENTS.md, skills); commit history is part of the repo-as-source-of-truth premise.
- Its nav icon is already a git-branch glyph.
- It is not opt-in, unlike Releases/Deployments (gated on `repoos.toml` blocks), so every repo gets it.

Rejected: **Checks** (about gating pass/fail; a log there blurs its purpose, but check status should show *in* the log), **Deployments/Releases** (opt-in, hidden for most repos; link *into* them via badges instead), **Control** (small overview page; a "last 5 commits" widget linking to History is an optional follow-up, not in scope).

## What to build

### Server
- New read-only endpoint, e.g. `GET /api/repo/log?branch=&path=&limit=&before=` in a new `src/server/routes/` module (register in `routes/index.ts`; see `docs.ts` for a comparable repo-scoped read route). Shell out to `git log` with a stable machine-readable `--format` (use a delimiter/`-z`, never parse human output); cursor pagination by commit (`before=<sha>`), default limit ~50.
- Return per commit: `sha`, `shortSha`, `subject`, `body`, `authorName`, `authorEmail`, `date` (ISO), `refs` (branch/tag decorations), `parents`, and `taskId` when the subject matches the `type(NNNN): ...` convention (e.g. `docs(0513): update task`).
- Second endpoint for a commit's changed files / diff (`GET /api/repo/commits/:sha`), reusing existing git helpers in `src/core/git.ts` where possible.
- Branch list endpoint (or include in the log response) for the branch filter: `main` plus task branches.
- Must be fast on large repos: cap limit, no unbounded output, do not block the event loop (async spawn).
- Validate `sha`/`branch`/`path` inputs strictly (no shell interpolation; pass as argv after `--`).

### UI (History tab)
- Commits grouped by day (sticky day headers), each row: subject, short sha (click to copy), relative time with absolute time on hover, author avatar/initials, ref chips.
- `docs(NNNN): ...` / `feat(NNNN)` style subjects link to that task (open the task drawer / Work view).
- Click a commit to expand inline (body + changed-file list with +/- counts) and open a diff. **DiffView.vue** is currently task-scoped (`/tasks/:taskId/diff`, fetches `/api/tasks/:id/file?path=&version=before|after`); either generalize it to accept a commit/ref pair or build a lightweight commit diff panel. Prefer reuse over a second diff renderer; keep the change to DiffView minimal and backward compatible.
- Filters: branch dropdown and a path filter. **Use the custom styled dropdown component, never a raw `<select>`** (AGENTS.md convention).
- "Load more" (or infinite scroll) using the cursor.
- Empty state, loading state, and error state (including "not a git repo").
- Mobile: must work in the mobile tab-bar layout.
- Any overlay/drawer must be `<Teleport to="body">`; use the shared `ui/dialog/*` components and global `ff-*` classes in `style.css` rather than bespoke scoped styling.

### Badges (nice-to-have, keep behind the core; split into a follow-up task if it grows)
- Per-commit **check status** badge (green/red) sourced from the Checks data, when a run exists for that commit.
- Per-commit **deployed to <env>** / **in release <tag>** badges when Deployments/Releases are configured; hide silently when not.

## Constraints (from AGENTS.md)
- Zero new runtime dependencies.
- Run everything under Bun (`bun run test`, never bare `bun test`).
- If a new user-facing config key is added (e.g. page size), it needs a Settings UI control + test. Prefer no new config.
- Update any doc the diff makes stale (`docs/`, `user-docs/`); add a short `user-docs/` note for the History tab.
- Add tests: server route (log parsing, pagination, input validation, task-id extraction) and UI component tests following existing `src/ui-app/tests/` patterns.
- Rebuild the UI (`bun run build:ui`) after UI changes; do not request a preview unless asked.
- `bun run fmt` before committing on the task branch; `repoos check` must be green before `review`.

## Acceptance criteria
- Context page has a History tab showing `main`'s log, grouped by day, paginated.
- Branch and path filters work.
- Task-id subjects link to their task.
- A commit opens a readable diff.
- No raw `<select>`, no new runtime deps, works on mobile, empty/error states handled.
- Tests added; `repoos check` passes.

## Out of scope
- Write operations (checkout, revert, cherry-pick, etc.); this is read-only.
- Graph/lanes visualization of branch topology (possible later).
- Dashboard "recent commits" widget.

## Activity

- 2026-09-26T05:57:03Z · created · unknown
- 2026-09-26T05:58:12Z · status inbox→ready

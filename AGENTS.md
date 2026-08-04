# AGENTS.md

This repo uses **RepoOS**: tasks are markdown files under `work/`, and the
repo itself is the source of truth. This file tells AI agents how to operate.

## Operating loop

1. Read this file first and any relevant docs under `docs/`. Then run `repoos list` to see current tasks.
2. Pick a task from `work/` whose `status: ready`.
3. Set its `status: active` (edit the frontmatter; do not move the file).
4. Create a branch named in the task's `branch:` field, or set one.
5. Run `repoos check` and confirm it passes (build, typecheck, tests, UI smoke test). Then implement → if the repo has a git remote, open an MR/PR against `main`.
6. Set `status: review` when ready for human sign-off, and only after a green `repoos check`. **Leave the branch open and do not merge it yourself** — see "Review and sign-off" below.

## Review and sign-off (review → done)

A task in `review` is done with implementation; the branch stays open and the
implementing agent stops. A human (or another AI) reviews it. The implementing
agent NEVER merges to `main` at `review` time — that happens only when the task
is moved to `done`.

**No git remote (the common RepoOS case):**

- Implementer: set `status: review`, leave the branch open, stop. Do not merge.
- Reviewer: review the diff, run `repoos check`. If changes are needed, request
  them; the implementer fixes them on the SAME branch, re-runs `repoos check`, and
  re-sets `review` (still not merged).
- Approval: the reviewer says **"move task <id> to done"**. Only then the
  implementer:
  1. sets `status: done` + activity entry and commits `docs(<id>): set status done`;
  2. fast-forward merges the branch to `main`;
  3. deletes the branch (`git branch -d <branch>`).
  This is the only path to `done`, and only on explicit instruction.

**With a git remote:**

- Implementer: same as above, but at `review` time also open an MR/PR against
  `main`. Never merge or self-approve your own MR.
- Reviewer: approve/reject via the MR; request changes on the same branch as
  needed (the MR is updated in place, never force-pushed).
- Approval: the MR is merged — by the reviewer, or by the implementer ONLY on an
  explicit "move task <id> to done". Then delete the remote + local branches and
  set `status: done` with an activity entry (commit `docs(<id>): set status done`).

## Definition of done

Before a task moves to review, `repoos check` must pass. This runs:
- Build staleness check (`src/` vs `dist/`)
- Full build (`tsc` + asset copy)
- Test suite (if any)
- Headless browser UI smoke test (WebKit) — verifies the app mounts, no unrendered mustache in the DOM, and zero console errors
- The smoke test **skips with a clear message** if Playwright or the browser binary isn't installed

One command — `repoos check` — is the single bar for "did this break anything?"

## This repo is self-hosted — read this before running anything

RepoOS manages its own roadmap. This means a few things are true that you
cannot tell from the code alone:

- The `repoos` command is very likely a `bun link` dev build pointing at THIS
  repo's `dist/`. It runs compiled JS, not the TypeScript source. **`repoos`
  warns automatically when the build is stale** (compares a hash of `src/`
  against the build marker in `dist/.build-info.json`). If you see a staleness
  warning, run `bun run build` before trusting any `repoos` output or the UI.
  This is the #1 way to waste time in this repo — the guardrail catches it.
- Editing the task file format, frontmatter schema, or the parser is a
  SELF-MODIFYING act: it affects this repo's own `work/*.md` files, including
  the task you are working on. If you change the format, write a migration in
  the same change and verify the parser still reads every existing file in
  `work/`.
- **Never run `bun add repoos` in this repo.** It is RepoOS — depending on
  itself is circular and will break installs. Its `package.json` lists only
  dev dependencies.

## Rules

- **Never** move task files between folders. Status lives in frontmatter.
- Keep frontmatter tidy; `repoos` normalizes key order on write.
- One task = one focused branch.
- Zero runtime dependencies is a hard design constraint. Do not add a runtime
  dependency without an explicit task authorizing it. Dev dependencies (test
  runners, types) are fine.

## Conventions

- Runtime: Bun (the package also runs under Node ≥ 20 once built).
- Language: TypeScript, NodeNext modules — imports use `.js` extensions even
  for `.ts` source (this is correct, not a bug).
- Build: `bun run build` (runs `tsc` then copies UI assets into `dist/ui/`).
- Source layout: `src/core` (engine), `src/server` (HTTP + SSE), `src/cli` +
  `src/commands` (CLI), `src/ui` (the single-file web UI).
- The AGENTS.md *template* that `repoos init` scaffolds into other repos lives in
  `src/commands/init.ts` as a string literal. It is NOT this file. Editing it
  ships to every future `repoos init`, so change it deliberately and don't confuse
  it with this repo's own AGENTS.md.

## Git setup: don't let a failed command skip branch creation

A past agent ran `git pull --ff-only && git checkout -b <branch>`. The pull
failed (no remote tracking branch), and `&&` short-circuited, so the branch was
never created and all work landed on `main`. Lessons:

- Do NOT chain git SETUP commands with `&&` such that one failure silently skips
  branch creation. Create the branch as its own step and confirm it succeeded.
- Do NOT `git pull` when branching from local `main` — there may be no tracking
  branch, and you don't need it. Branch from local: `git checkout main` then
  `git checkout -b <branch>`.
- Before your FIRST commit, verify you are on the intended branch, not `main`
  (`git branch --show-current`). If you're on `main`, stop and create the branch
  first (stash, branch, re-apply if needed).
- Once `repoos start` exists, branch/worktree creation is RepoOS's job, not yours —
  don't hand-roll git setup for a task.

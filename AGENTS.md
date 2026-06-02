# AGENTS.md

This repo uses **RepoOS**: tasks are markdown files under `work/`, and the
repo itself is the source of truth. This file tells AI agents how to operate.

## Operating loop

1. Read this file first and any relevant docs under `docs/`. Then run `ros list` to see current tasks.
2. Pick a task from `work/` whose `status: ready`.
3. Set its `status: active` (edit the frontmatter; do not move the file).
4. Create a branch named in the task's `branch:` field, or set one.
5. Implement → test → open an MR.
6. Set `status: review` when ready for human sign-off.

## This repo is self-hosted — read this before running anything

RepoOS manages its own roadmap. This means a few things are true that you
cannot tell from the code alone:

- The `ros` command is very likely a `bun link` dev build pointing at THIS
  repo's `dist/`. It runs compiled JS, not the TypeScript source. **`ros`
  warns automatically when the build is stale** (compares a hash of `src/`
  against the build marker in `dist/.build-info.json`). If you see a staleness
  warning, run `bun run build` before trusting any `ros` output or the UI.
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
- Keep frontmatter tidy; `ros` normalizes key order on write.
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
- The AGENTS.md *template* that `ros init` scaffolds into other repos lives in
  `src/commands/init.ts` as a string literal. It is NOT this file. Editing it
  ships to every future `ros init`, so change it deliberately and don't confuse
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
- Once `ros start` exists, branch/worktree creation is RepoOS's job, not yours —
  don't hand-roll git setup for a task.

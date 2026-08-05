---
id: "0028"
title: Add guided new-git-repo mode to repoos init
type: feature
status: inbox
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-05T05:29:08Z"
updated_at: "2026-08-05T05:29:08Z"
---
## Activity

- 2026-08-05T05:29:08Z · created · unknown

## Problem

`repoos init` only works inside an existing git repo: run it in a bare
directory and there is nothing for RepoOS to hook into. Someone trying RepoOS on
a fresh project has to manually `git init`, then `repoos init`, then remember to
commit the scaffold. The first-run experience should be a single guided command
that can bootstrap a brand-new RepoOS project from scratch.

## Desired UX

- Running `repoos init` in a directory that is NOT inside any git repo guides
  the user through a short set of CLI prompts to create a new RepoOS project:
  confirm the location, name the project, optionally make the initial commit.
- The flow runs `git init`, scaffolds the same files `repoos init` already
  produces (work/, docs/, repoos.toml, AGENTS.md, .gitignore, sample task
  0001), and reports what it did.
- Running `repoos init` inside an existing git repo keeps today's behavior —
  idempotent scaffold, no prompts.
- Non-interactive (piped/CI) invocation never hangs: it prints what would
  happen and exits non-zero unless explicit flags are given.

## Acceptance criteria

- [ ] `repoos init` in a non-git directory interactively guides: confirms before
      doing anything, then `git init` + scaffold in place (same files as today)
- [ ] Existing-repo behavior unchanged (no prompts, idempotent)
- [ ] A fresh-repo flow can optionally create an initial commit of the scaffold
- [ ] Non-TTY invocation does not block on input; prints guidance and exits
      non-zero (or honors explicit flags)
- [ ] No new runtime dependencies (prompts via `node:readline/promises`)
- [ ] `repoos check` passes

## Notes for AI

- `cmdInit` in `src/commands/init.ts`. Detection: `isGitRepo()` in
  `src/core/git.ts` (note it returns true when cwd is inside a PARENT repo too —
  that's the existing-repo path, which is correct).
- Interactive prompts must gate on `process.stdin.isTTY`; in non-TTY mode fail
  loud instead of hanging. `node:readline/promises` is the zero-dep way.
- The initial scaffold commit is a MULTI-file commit (work/, docs/, AGENTS.md,
  repoos.toml, .gitignore, sample task) — deliberately `git add -A && git
  commit` on a brand-new repo. This is NOT the 0023 single-file surgical helper
  (`commitNewFile`); do not reuse it here. The 0023 guardrail against sweeping
  pre-staged files is about task creation; a fresh repo has nothing pre-staged.
- Respect existing git identity/hooks; never amend/force. If git identity is
  unset and auto-detection fails, warn but still scaffold (leave repo
  uncommitted, like 0023's fail-soft).
- Open design decisions (ask the task owner before locking): flag vs default
  trigger, current-dir vs subdir, initial-commit default, branch name.

## Scope

- **This task**: the guided non-git flow in `repoos init` (+ detection + prompts
  + optional initial commit).
- **Defer**: templates/presets beyond the current scaffold; anything that changes
  the existing-repo `repoos init` behavior; UI equivalents.

## Related

- 0027: `repoos init` scaffolding + the AGENTS.md template it writes.
- 0023: git lifecycle helpers + fail-soft conventions (auto-commit on create).
- `docs/adr/0003-self-hosting.md`: the `bun link` dev loop `repoos init` serves.

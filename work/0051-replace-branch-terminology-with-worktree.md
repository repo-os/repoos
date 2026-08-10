---
id: "0051"
title: "Replace \\\"branch\\\" terminology with \\\"worktree\\\" in task files and docs"
type: chore
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/replace-branch-terminology-with-worktree
created_at: "2026-08-06T17:33:31Z"
updated_at: "2026-08-10T23:43:39Z"
---
## Problem

Since task 0041, agents run in git worktrees instead of plain branches, and task 0047's move-to-done merges the branch and removes the worktree. The terminology in RepoOS's own documentation has not caught up: `AGENTS.md`, task files under `work/`, `docs/`, and `skills/code-review/SKILL.md` still say "branch" where "worktree" is now the accurate term for a task's workspace, and several places already hedge with mixed "branch/worktree" phrasing. The drift makes the docs read as stale and forces readers to translate between two names for the same thing.

## Desired UX

Everywhere RepoOS describes the task workspace — how it is created, checked out, kept open during review, merged, and removed — reads "worktree". The word "branch" is kept only where a literal git branch is meant: the branch name stored in frontmatter, the branch that the worktree is checked out on, and git operations on that branch (fast-forward merge into `main`, `git branch -d`). A reader should never have to guess whether "branch" means the worktree or an actual branch.

## Acceptance criteria

- [ ] `AGENTS.md` at the repo root updated: operating loop, "Review and sign-off", "Rules", and "Git setup" sections say "worktree" for the task workspace, while keeping "branch" where a git branch is literally meant (e.g. "fast-forward merges the branch to `main`", `git branch -d <branch>`, "branch already merged").
- [ ] Every `work/*.md` task file reviewed: prose that uses "branch" to mean the task's workspace is changed to "worktree". The frontmatter `branch:` key and its branch-name values are left unchanged.
- [ ] `docs/` prose updated where it describes the task workspace (`concepts.md`, `architecture.md`, `adr/*.md`, `vision.md`, `roadmap.md`), with literal-branch usages retained.
- [ ] `skills/code-review/SKILL.md` updated to match the repo-root `AGENTS.md` wording.
- [ ] The `AGENTS.md` template string in `src/commands/init.ts` updated to mirror this repo's updated `AGENTS.md`.
- [ ] Source code comments and user-facing strings in `src/` updated where they say "branch" but mean the task's worktree.
- [ ] No remaining mixed "branch/worktree" hedging phrasing in the files touched.
- [ ] `repoos check` passes (build + typecheck + tests + UI smoke test) before setting `status: review`.

## Notes for AI

- This is a terminology copy-edit, **not** a behavior or schema change.
- Do **not** rename the `branch:` frontmatter key to `worktree:`. The field stores a git branch name (the branch the worktree is checked out on) and is read/written by the parser, `git.ts`, and the UI. Renaming the key is a schema change with a migration requirement and is out of scope — this assumption is a deliberate scope boundary.
- "Branch" stays wherever a literal git branch is meant: the frontmatter branch name, `git branch -d <branch>`, "merge the branch into `main`", "branch already merged", "branch without worktree".
- This repo is self-hosted: task files are the roadmap. After any edits to files under `work/`, verify the parser still reads every `work/*.md` file.
- The `AGENTS.md` template in `src/commands/init.ts` is a string literal that ships to every future `repoos init`; change it deliberately to match this repo's own file.
- Do not touch `git` history or branch names in any task file's frontmatter.
- Run `grep -ri branch` and judge each hit on its merits; when ambiguous, default to "worktree" only when the text describes the task's workspace/checkout.
- Do not edit `scripts/screenshot-fixtures/work/*.md` or the frontmatter example in `README.md` — they exist to illustrate frontmatter, not workspace prose.
- The `repoos` CLI runs from `dist/`; if `src/` changes, rebuild (`bun run build`) before running `repoos check`.

## Scope

**In:** prose in `work/*.md`, repo-root `AGENTS.md` and the `init.ts` template, `docs/*.md`, `skills/code-review/SKILL.md`, and `src/` comments/strings that use "branch" to mean the task workspace.

**Deferred:** renaming the `branch:` frontmatter key (schema + migration); `scripts/screenshot-fixtures/work/*.md`; the frontmatter example in `README.md`.

## Related

- `0041` — run agents in git worktrees instead of plain branches
- `0044` — fix agent spawn to pass dir into the worktree
- `0047` — move-to-done action that merges the branch and closes the worktree

## Activity

- 2026-08-06T17:33:31Z · created · unknown
- 2026-08-06T17:35:08Z · status inbox→ready
- 2026-08-06T18:21:21Z · status ready→active, branch
- 2026-08-10T22:06:08Z · status active→ready
- 2026-08-10T22:06:14Z · status ready→active
- 2026-08-10T22:57:55Z · status active→ready
- 2026-08-10T22:57:56Z · status ready→active
- 2026-08-10T23:37:36Z · status active→ready
- 2026-08-10T23:37:45Z · status ready→active
- 2026-08-10T23:43:39Z · status active→review

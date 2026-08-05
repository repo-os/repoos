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

- Running `repoos init` in a directory that is NOT inside any git repo starts a
  guided, interactive flow by default (no flag needed).
- Location is explicit and never surprising:
  - Default: create the new project in the CURRENT directory. The prompt says so
    in plain words: "Create a new RepoOS project in the current directory
    (</path/to/dir>)?"
  - Entering a project name creates a subdirectory instead, and the flow
    DOUBLE-CONFIRMS that choice before doing anything (e.g. "Create in new
    subdirectory ./name? [y/N]").
  - `repoos init <project-name>` with a positional arg means "create a subdir
    named <project-name>" — but the prompt flow still double-confirms before
    running.
- The flow: confirm → `git init` → scaffold the same files `repoos init`
  already produces (work/, docs/, repoos.toml, AGENTS.md, .gitignore, sample
  task 0001) → report what it did.
- The flow OPTIONALLY asks for a one-line project description, plainly marked
  as skippable. If given, it is seeded into the sample task 0001 body so the
  AI/agents have initial context to guide the user on what to do next. If
  skipped, no problem — the AI gathers that context later when it needs it.
- Initial commit: the flow ASKS "Make an initial commit of the scaffold?
  [y/N]" (default yes). Before/while doing so it checks git health and WARNS
  loudly about anything wrong — git not installed, or no usable git identity —
  then fail-softs (scaffolds anyway, leaves the repo uncommitted) instead of
  failing.
- Running `repoos init` inside an existing git repo keeps today's behavior —
  idempotent scaffold, no prompts.
- Non-interactive (piped/CI) invocation never hangs: it prints what would
  happen and exits non-zero.

## Acceptance criteria

- [ ] `repoos init` in a non-git directory interactively guides: states the
      current-dir default in plain words, accepts a project name for a
      subdirectory, double-confirms the subdirectory choice, confirms before
      running, then `git init` + scaffold in place
- [ ] `repoos init <project-name>` means subdir creation, still double-confirmed
- [ ] Optionally prompts for a one-line project description (plainly skippable);
      when provided, seeds it into the sample task 0001 body
- [ ] Existing-repo behavior unchanged (no prompts, idempotent)
- [ ] Prompts for the initial commit (default yes); warns on git problems (not
      installed, no identity) and fail-softs to "scaffolded, left uncommitted"
- [ ] Non-TTY invocation does not block on input; prints guidance and exits
      non-zero
- [ ] No new runtime dependencies (prompts via `node:readline/promises`)
- [ ] `repoos check` passes

## Notes for AI

- `cmdInit` in `src/commands/init.ts`. Detection: `isGitRepo()` in
  `src/core/git.ts` (note it returns true when cwd is inside a PARENT repo too —
  that's the existing-repo path, which is correct). Detect git presence
  separately via `git --version` (git may be absent even in a gitless dir).
- Interactive prompts must gate on `process.stdin.isTTY`; in non-TTY mode fail
  loud instead of hanging. `node:readline/promises` is the zero-dep way.
- Git health warnings: git missing (`git --version` fails) → warn, skip
  `git init` + commit, scaffold files anyway. Identity unset (both
  `git config --get user.name` and `user.email` empty) → warn that git may
  auto-detect or the commit may fail; still attempt, and fail-soft if the
  commit errors (mirror 0023's behavior).
- The initial scaffold commit is a MULTI-file commit (work/, docs/, AGENTS.md,
  repoos.toml, .gitignore, sample task) — deliberately `git add -A && git
  commit` on a brand-new repo. This is NOT the 0023 single-file surgical helper
  (`commitNewFile`); do not reuse it here. The 0023 guardrail against sweeping
  pre-staged files is about task creation; a fresh repo has nothing pre-staged.
- Respect existing git identity/hooks; never amend/force.
- Prompt wording must make the current-dir default unambiguous — this is a
  deliberate anti-confusion requirement (the task owner cited confusing
  scaffolding tools as the motivation).
- Project description prompt: single optional line, empty = skip. Home is the
  seeded sample task 0001 BODY (agents read tasks directly). Do NOT add a
  `description` field to repoos.toml/config schema in this task — that touches
  `getConfigSchema()` and the settings editor UI and belongs in a follow-up if
  the description should outlive the sample task.

## Scope

- **This task**: the guided non-git flow in `repoos init` (+ detection, prompts,
  optional initial commit with git-health warnings).
- **Defer**: templates/presets beyond the current scaffold; anything that changes
  the existing-repo `repoos init` behavior; UI equivalents.

## Related

- 0027: `repoos init` scaffolding + the AGENTS.md template it writes.
- 0023: git lifecycle helpers + fail-soft conventions (auto-commit on create).
- `docs/adr/0003-self-hosting.md`: the `bun link` dev loop `repoos init` serves.

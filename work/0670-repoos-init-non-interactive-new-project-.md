---
id: "0670"
title: "repoos init: non-interactive new-project mode for agents (flags) and an actionable non-TTY error"
type: feature
status: done
priority: p2
area: cli
story: "Field report: first agent-driven project run (opex)"
merged_commit: 2fe5b0629e75708447755cb06f0bb723619ee49a
assigned_to: ai
created_by: ""
branch: feat/repoos-init-non-interactive-new-project-
created_at: "2026-10-05T15:20:07Z"
updated_at: "2026-10-05T17:16:35Z"
merge_conflict_retry_count: 1
review_passes: 1
dev_error_count: 1
---
## Problem

An AI agent (or any script) cannot start a brand-new RepoOS project with the guided flow. Found while an agent bootstrapped a real project from scratch (2026-10-05):

- Outside a git repo, `repoos init <name>` refuses when stdin is not a TTY: "This directory isn't a git repo, so repoos init needs interactive prompts. Run it in a terminal, or run `git init` first and then `repoos init` again."
- That error steers the agent to the fallback, which is the WRONG path for a new project: inside any git repo `init` always seeds the "Read this codebase" starter (`scaffoldInto(..., "existing")`, `src/commands/init.ts` ~line 1462), even in an empty repo. The agent ended up with a nonsensical `ready` task about reading a codebase that did not exist.
- The guided flow itself works fine when driven through a pseudo-terminal (verified with Python `pty.fork()` answering Enter at each prompt: subdirectory Y/n, project description, task areas, initial commit Y/n, launch web console Y/n, and it seeds `Flesh out the product vision and initial architecture`), so nothing is technically missing except a supported non-interactive entry point. Agent harnesses (Claude Code's Bash tool, Codex exec, Cursor agent) have no TTY and cannot do pty tricks reliably.

## Desired UX

A supported, documented, non-interactive way to run the new-project flow, and a non-TTY error that tells the agent exactly how to succeed.

- `repoos init <name> --new` (or `--yes`) runs the guided new-project flow with answers from flags and sensible defaults:
  - `--description "<text>"` (also `--description-file <path>` or `-` for stdin, multi-line markdown)
  - `--areas web,api,data` (comma-separated, same rule as the area vocabulary)
  - `--commit` / `--no-commit` (initial commit of the scaffold; default: commit)
  - `--launch` / `--no-launch` (web console; default: do NOT launch when non-interactive)
  - `--dir <path>` or the positional name behaves as today (subdirectory) and refuses to overwrite an existing non-empty directory without `--force`.
- Without a TTY and without `--new`, the refusal message prints the exact command to run, for example: `Not a TTY. To create a new project non-interactively run: repoos init <name> --new --description "..." --areas web,api --no-launch`. It must also warn that `git init` followed by `repoos init` seeds the existing-codebase starter, so it is the wrong route for a new project.
- `repoos init --help` documents all of the above and says which flags apply to new vs existing repos.
- Output on success is machine-friendly enough for agents: ends with the created project path, the server hint, and the id of the seeded starter task. A `--json` flag printing `{ root, tasks: [...], created: [...] }` is welcome but optional.

## Acceptance criteria

- New flags implemented in `src/commands/init.ts` (and the CLI help registry), wired to the same code the guided prompts use, so interactive and non-interactive paths cannot drift. No change to interactive behaviour.
- With `--new` in a non-TTY (stdin from /dev/null) in an empty temp dir the command creates the project, seeds the vision starter task (not the read-the-codebase one), honours `--description`, `--areas`, `--commit`/`--no-commit`, never launches the server unless `--launch`.
- Non-TTY run without `--new` exits non-zero with the actionable message above; existing-repo init (inside a git repo) is unchanged and still works non-interactively.
- Tests: unit tests for flag parsing and the message; an integration test that spawns the CLI with no TTY in a temp dir and checks files and the seeded task; keep existing init tests green.
- Docs: `user-docs/cli.md` (`repoos init` section) and `user-docs/getting-started.md` updated (see the docs task for the agent-specific section if it exists; at minimum list the flags). Update the AGENTS.md template string in `init.ts` ONLY if it needs a one-line pointer.
- `repoos check` passes.

## Notes for AI

Related earlier work: task 0028 (guided new-git-repo mode) and 0364 (seed a real starter task after init). Do not build a second implementation of the flow; extract the prompt answers into one options object that both the prompts and the flags fill. Never write or hand-edit work/*.md files. Do not run `repoos serve` yourself.

## Activity

- 2026-10-05T15:20:07Z · created · unknown
- 2026-10-05T15:39:09Z · status inbox→ready
- 2026-10-05T15:39:10Z · status ready→active, branch
- 2026-10-05T16:07:32Z · status active→review
- 2026-10-05T16:07:33Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-05T16:32:27Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-05T16:42:26Z · status review→done, release:success
- 2026-10-05T17:16:35Z · story

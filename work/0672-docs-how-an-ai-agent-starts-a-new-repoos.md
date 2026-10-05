---
id: "0672"
title: "Docs: how an AI agent starts a new RepoOS project (recipe, pitfalls, pointers)"
type: chore
status: done
priority: p2
area: docs
merged_commit: 81ad6836d5859450e284e88f5cfae81c797dde39
assigned_to: ai
created_by: ""
branch: feat/docs-how-an-ai-agent-starts-a-new-repoos
created_at: "2026-10-05T15:20:11Z"
updated_at: "2026-10-05T16:00:30Z"
---
## Problem

There is no documentation telling an AI agent how to start a new RepoOS project. An agent that follows the obvious path hits a non-TTY refusal, falls back to `git init` + `repoos init`, and silently gets the wrong starter task (see the related init-flags and starter-task tasks). The knowledge of what works (pseudo-terminal, then flags once they exist) lives only in this task's description.

## Desired UX

An agent (or a human briefing one) can find, in one place, the exact recipe for starting a new project and the traps to avoid:

- A "Starting a new project as an agent" section in `user-docs/getting-started.md` (and a short pointer from `user-docs/existing-repo.md` and `user-docs/cli.md`) covering: the non-interactive command with flags (once the flags task lands; until then the pty recipe), why `git init` + `repoos init` gives the existing-codebase starter, what to do right after init (read AGENTS.md; promote the starter task; never hand-edit work/*.md; run the server in a real terminal tab or via `repoos service`, not as a detached child of a short-lived shell, because agent shells reap background processes).
- The `repoos init` non-TTY refusal message links to that section.
- Optional small touch: a one-paragraph "For AI agents" block in the AGENTS.md template string in `src/commands/init.ts` (clearly labelled, short) that explains the operating-loop pointers an agent needs on day one: where the board is, how to create tasks (`repoos new`), never to edit `work/*.md`, how to hand off. Keep the template lean; this is a pointer, not a manual.

## Acceptance criteria

- New docs section written and linked from the docs sidebar/index; builds with the user-docs site (`user-docs`), no broken links.
- Includes a copy-pasteable pty fallback for harnesses without the flags (a ~10-line Python `pty.fork()` example answering the prompts), clearly marked as a workaround, to be removed or demoted once `--new` exists.
- Documents the three pitfalls found in practice: (1) `git init` then `repoos init` seeds the wrong starter; (2) starter tasks are suggestions (inbox) not work to auto-run; (3) background server processes started from an agent shell get killed, so use a real terminal tab or `repoos service`.
- If the flags task has merged when you start this, document the flags as the primary path; otherwise write against the planned flag names and mark them "coming soon" only if they do not exist yet.
- `repoos check` passes (including any docs build step).

## Notes for AI

Depends on the init-flags task for the final wording but can start with the pty recipe. Do not invent behaviour: verify each statement by running the command in a throwaway directory (delete it afterwards). Never hand-edit work/*.md.

## Activity

- 2026-10-05T15:20:11Z · created · unknown
- 2026-10-05T15:37:56Z · status inbox→ready
- 2026-10-05T15:38:00Z · status ready→active, branch
- 2026-10-05T15:47:51Z · status active→review
- 2026-10-05T16:00:30Z · status review→done, release:success

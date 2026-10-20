---
id: "0881"
title: Portable RepoOS Agent Skill for outside agents
type: feature
status: active
paths: [agent/skill, landing, user-docs]
priority: p2
area: docs
story: Agent-discoverable RepoOS
depends_on: ["0879"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/portable-repoos-agent-skill-for-outside-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T16:01:54Z"
updated_at: "2026-10-20T20:28:34Z"
---
## Problem

A coding agent that does not run inside RepoOS has no portable skill it can fetch. `skills/` in this repository is the in-app skill directory RepoOS loads for a managed repo; publishing an onboarding skill there would mix outside-agent instructions with the product's own skills. Commands in a skill also go stale when they are not checked against `repoos` help and `repoos init`.

## Desired UX

One skill directory in the public repo, outside `skills/`, follows the [Agent Skills specification](https://agentskills.io/specification). `SKILL.md` is short. Deeper workflows (detect an existing install, install, init, tasks, stories, leaving unrelated Git changes alone) live in linked reference files and point at the docs site instead of pasting the manual. Any compatible agent can fetch that one directory. Claude, Cursor, and Codex folders are install targets described in the guide, not second copies committed here.

Both public `llms.txt` files link to the skill.

## Acceptance criteria

- The skill lives in one directory. Prefer `agent/skill/` next to `agent/starter-prompt.md` from the prompt task, unless a fetch path several agents already support requires a different single directory. Record the chosen public URL (GitHub tree or raw `SKILL.md` on https://github.com/repo-os/repoos). Do not add `.claude/`, `.cursor/`, or Codex skill copies in this repo.
- `SKILL.md` has the spec frontmatter and stays short. Reference files cover: what RepoOS does; how to detect an existing install (a `repoos` binary on PATH, and a `repoos.toml` in the repo); the six install commands from `user-docs/getting-started.md`; `repoos init` and the default `repoos/work/`, `repoos/docs/`, `AGENTS.md`, and `repoos.toml` layout; where tasks, project docs, and `AGENTS.md` live; how to discover commands (`repoos --help` and the CLI page); how to create tasks and stories (`repoos new`, `repoos story`); and how to avoid staging or reverting unrelated Git changes. Do not copy the user manual into the skill.
- A test compares the skill's commands and flags with current CLI help and with init's default namespaced layout (`src/` init scaffold and `src/ui-app/tests/init-scaffold.test.ts`). A renamed flag or a changed default path fails the test.
- The landing `llms.txt` generator and the docs `llms.txt` index both link to this skill URL. The docs link is produced by the generator (a page, a config entry, or an extra generated link), not a hand-edited copy of `llms-full.txt`.

## Notes for AI

Story: Agent-discoverable RepoOS, slice 3. Area `docs`. Depends on the canonical-prompt task because the landing `llms.txt` generator must already exist before this task adds the skill link.

Read `repoos init` behavior before writing the layout section (default namespaced `repoos/` layout, non-interactive `--new` flags in `user-docs/getting-started.md`). `user-docs/running-with-agents.md` is the later operating loop; link it, do not restate it. `user-docs/cli.md` is the command reference.

Do not add CLI features, a public MCP server, or provider-specific plugins. Install notes for humans belong in the agent guide task that depends on this one; this task only needs the fetch URL in the skill and in both `llms.txt` files.

## Decision
The portable skill lives at `agent/skill/`. Public URL: https://github.com/repo-os/repoos/tree/main/agent/skill (raw SKILL.md: https://raw.githubusercontent.com/repo-os/repoos/main/agent/skill/SKILL.md). Its frontmatter name is `repoos`, so an agent installs the directory as `repoos/`; no `.claude/`, `.cursor/`, or Codex copy is committed. The docs `llms.txt` link comes from `user-docs/agent-skill.md`, which the docs index generator lists (the page description carries the skill URL); the landing generator links the same URL.

## Activity

- 2026-10-20T16:01:54Z · created · njachowski@gmail.com
- 2026-10-20T20:10:59Z · status inbox→ready
- 2026-10-20T20:11:06Z · cli_override, model_override
- 2026-10-20T20:11:07Z · status ready→active, branch
- 2026-10-20T20:18:03Z · body
- 2026-10-20T20:23:31Z · body
- 2026-10-20T20:26:46Z · body
- 2026-10-20T20:28:34Z · body: Decision (added)
- 2026-10-20T20:28:34Z · message_queued at 2026-10-20T20:28:34.988Z

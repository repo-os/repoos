---
id: "0879"
title: Canonical starter prompt and landing llms.txt
type: feature
status: review
paths: [agent/starter-prompt.md, landing]
priority: p2
area: landing
story: Agent-discoverable RepoOS
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/canonical-starter-prompt-and-landing-llm
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T16:00:59Z"
updated_at: "2026-10-20T20:01:25Z"
---
## Problem

An outside coding agent pointed at https://repoos.org has no short, canonical overview to read. The marketing site (`landing/`, Vite, static `public/` copied to `landing/dist`, served by the Cloudflare Worker) publishes install commands in `landing/src/components/InstallBox.vue` and the docs site repeats them in `user-docs/getting-started.md`, but nothing emits `https://repoos.org/llms.txt`. There is also no single source file for the starter prompt that later landing and docs surfaces must share.

## Desired UX

`https://repoos.org/llms.txt` is a short [llms.txt](https://llmstxt.org/) file: what RepoOS is, who it is for (a small team or independent developer using a coding agent), the core idea (tasks in the repo, agents in worktrees, a person approves the merge), the verified install commands, and links onward. A person opening it in a browser sees plain text, not the marketing page.

The starter prompt lives in one file, `agent/starter-prompt.md` at the repo root (outside `skills/` and outside this repo's `docs/`). That file is the only copy of the prompt text. The landing build reads it when it writes `llms.txt`; it does not paste a second copy into a Vue component.

## Acceptance criteria

- `agent/starter-prompt.md` exists and is the only committed copy of the starter prompt. The prompt tells an agent to read `https://repoos.org/llms.txt` first, then the docs index only if it needs more, and to inspect the current Git repository before installing or editing anything.
- `cd landing && bun run build` writes `landing/dist/llms.txt` at the dist root (Vite already copies `landing/public/` there; generate this file in the build, via `landing/vite.config.ts`, so the Worker serves `https://repoos.org/llms.txt`). `vite dev` serves the same path.
- The file follows llmstxt.org: an H1, a blockquote summary, then sections of `- [name](url): note` links. It stays an overview (well under the length of the user manual), not a dump of `user-docs/`.
- Install lines match the commands already published, with no third spelling:
- `curl -fsSL https://repoos.org/install | bash`
- `brew install repo-os/tap/repoos`
- `npm install -g @repo-os/repoos`
- `bun add -g @repo-os/repoos`
- `pnpm add -g @repo-os/repoos`
- mise: getting-started uses `mise use --global npm:@repo-os/repoos`; `InstallBox.vue` uses `mise use -g npm:@repo-os/repoos`. Those are the same flag. Publish the long form from `user-docs/getting-started.md`.
- Links include https://docs.repoos.org, https://docs.repoos.org/getting-started, https://docs.repoos.org/cli, https://docs.repoos.org/ai-agents (the guide added later in this story), and https://github.com/repo-os/repoos. Do not invent a skill URL; the skill task adds that link once the directory exists.
- This repo's `docs/` is not linked or indexed. No `agents.txt`.

## Notes for AI

Story: Agent-discoverable RepoOS (`stories/agent-discoverable-repoos.md`), slice 1. Area `landing`. This task can proceed in parallel with the docs-index task.

Touch `landing/vite.config.ts`, a small generator next to it, and `agent/starter-prompt.md`. Do not edit `skills/` (in-app skills) or `docs/` (RepoOS build context). Do not add a new `repoos check` step: `landing-build` in `repoos.toml` already runs `bun run build` in `landing/` when `landing/**` changes. A later task in this story makes that build fail when `llms.txt` is missing or the install lines drift.

Out of scope: the docs-site `llms.txt` / `llms-full.txt`, the Agent Skill, `user-docs/ai-agents.md`, the shared call-to-action buttons, and any CLI or worktree changes.

`user-docs/index.md` omits mise from its code group; getting-started is the complete published set. Read `landing/src/components/InstallBox.vue` before copying commands.

## Activity

- 2026-10-20T16:00:59Z · created · njachowski@gmail.com
- 2026-10-20T19:46:58Z · status inbox→ready
- 2026-10-20T19:47:01Z · cli_override, model_override
- 2026-10-20T19:47:03Z · status ready→active, branch
- 2026-10-20T19:51:25Z · body
- 2026-10-20T20:01:25Z · status active→review

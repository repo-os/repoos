---
id: "0882"
title: Agent getting-started guide at /ai-agents
type: feature
status: active
paths: [user-docs/ai-agents.md, user-docs/.vitepress/config.mts, agent/starter-prompt.md]
priority: p2
area: docs
story: Agent-discoverable RepoOS
depends_on: ["0879", "0880", "0881"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/agent-getting-started-guide-at-ai-agents
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T16:02:17Z"
updated_at: "2026-10-20T21:20:07Z"
---
## Problem

The docs site explains how to drive a board after RepoOS is installed (`user-docs/running-with-agents.md`) but not the earlier step: hand an unfamiliar agent the website and let it set the tool up. A nested `user-docs/getting-started/ai-agents.md` would collide with the `/getting-started` clean URL because `user-docs/getting-started.md` is already a file. The sidebar in `user-docs/.vitepress/config.mts` is hand-curated, so a new page that is not listed there never appears in navigation.

## Desired UX

`https://docs.repoos.org/ai-agents` is a human-readable guide in the Getting started sidebar. It explains the approach (short index first, full manual on request, one shared starter prompt, one portable skill, no provider-specific integration). It embeds the canonical prompt from `agent/starter-prompt.md` rather than pasting a second copy. It links `llms.txt`, `llms-full.txt`, the skill, install, init, the CLI, and `running-with-agents` for the later operating loop. It tells the reader to have the agent inspect the repository first, preserve existing files and Git changes, and ask before significant edits. Claude Code, Codex, OpenCode, and Cursor appear only as examples of compatible agents.

## Acceptance criteria

- `user-docs/ai-agents.md` builds to `/ai-agents`. There is no `user-docs/getting-started/ai-agents.md`.
- `themeConfig.sidebar` in `user-docs/.vitepress/config.mts` lists the page under "Getting started", next to "Install and first task".
- The page includes the starter prompt by reading `agent/starter-prompt.md` (a snippet include or a build-time include). A test or build check fails if the rendered guide's prompt text differs from that file.
- The page links to `/llms.txt`, `/llms-full.txt`, the skill URL chosen by the skill task, `/getting-started`, init on that page, `/cli`, and `/running-with-agents`.
- The permission guidance is present in those words' meaning: inspect the repository first, preserve existing files and Git changes, ask before significant edits.
- Agent product names are examples, not a matrix of branded logos or per-vendor plugins.

## Notes for AI

Story: Agent-discoverable RepoOS, slice 4. Area `docs`. Depends on the prompt file (#0879), the docs index (#0880), and the skill task (#0881). The guide includes the prompt and links a real skill URL. It also links `/llms.txt` and `/llms-full.txt`, which VitePress will treat as dead links until the docs build emits them, so this task waits on the index task even though the story table listed only the prompt and the skill.

`user-docs/README.md` documents the hand-curated sidebar. Follow the tone of `user-docs/getting-started.md` and `user-docs/running-with-agents.md`. Do not index this repo's `docs/`. Do not add the landing or docs homepage call-to-action button here; the next task renders that from the same prompt once this URL exists.

Declare a docs-site shot if you want review to open the new page: target the docs preview, route `/ai-agents`.

## Activity

- 2026-10-20T16:02:17Z · created · njachowski@gmail.com
- 2026-10-20T21:09:56Z · status inbox→ready
- 2026-10-20T21:10:00Z · cli_override, model_override
- 2026-10-20T21:10:01Z · status ready→active, branch
- 2026-10-20T21:20:07Z · body

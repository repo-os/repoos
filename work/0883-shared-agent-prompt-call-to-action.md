---
id: "0883"
title: Shared agent prompt call to action
type: feature
status: inbox
paths: [agent/starter-prompt.md, landing/src, user-docs/index.md, user-docs/.vitepress/theme]
priority: p2
area: [landing, docs]
story: Agent-discoverable RepoOS
depends_on: ["0879", "0882"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T16:02:35Z"
updated_at: "2026-10-20T16:02:35Z"
---
## Problem

The starter prompt and the agent guide will exist as files, but neither the marketing homepage nor the docs homepage offers them. A visitor who already uses a coding agent sees only the install box (`landing/src/components/InstallBox.vue` in the hero of `landing/src/App.vue`, and the "Try it now" commands in `user-docs/index.md`). The copy button cannot be static Markdown on the docs homepage, and the two sites must not each keep their own copy of the prompt or the call-to-action strings.

## Desired UX

Landing and the docs homepage render the same compact block from one shared source:

- Heading: "Building with an AI coding agent?"
- One sentence of explanation.
- A short preview of the starter prompt (the opening of `agent/starter-prompt.md`, not a rewritten blurb).
- A button labelled "Copy prompt for your agent" that copies the full prompt, with a visible success state and an accessible name.
- A secondary link to the agent guide (`https://docs.repoos.org/ai-agents` on the landing site, `/ai-agents` on the docs site).

The block sits with the existing install path: in the landing hero column beside `InstallBox` (the hero grid in `landing/src/App.vue`), and on the docs homepage with the "Try it now" section. It stays compact on a narrow viewport and on desktop. Each site uses its own theme tokens (landing CSS variables; the docs theme in `user-docs/.vitepress/theme/`). Keyboard users can focus the button and activate it. The copied state is visible, not only a color change.

## Acceptance criteria

- One module both builds import (for example `agent/cta.json` plus `agent/starter-prompt.md`) holds the heading, the sentence, the button label, the success string, and the guide path. Vue files do not duplicate those strings.
- Landing (`landing/src/App.vue` or a component it mounts next to `InstallBox`) and the docs homepage (`user-docs/index.md` plus a component registered from `user-docs/.vitepress/theme/index.ts`) render that module. The docs homepage is a VitePress `layout: home` page, so the button is a theme component, not raw Markdown pretending to copy.
- Activating the button writes the full `agent/starter-prompt.md` text to the clipboard and shows the shared success string. Follow the existing non-secure-context fallback in `InstallBox.vue` (`navigator.clipboard` with a textarea fallback). The success state is in the accessible name or an adjacent status element.
- The secondary link targets the guide from the previous task and does not 404 in the docs build (`ignoreDeadLinks` must not be used to hide it).
- Layout: the install box remains; this block does not replace it. At a narrow width the block stacks without horizontal scrolling. No native `title` tooltip, `alert`, or `confirm`.
- Declare review shots with `repoos update <id> --shots`: one landing shot (landing preview target, route `/`, highlight the new block) and one docs shot (docs preview target, route `/`, highlight the new block).

## Notes for AI

Story: Agent-discoverable RepoOS, slice 5. Areas `landing,docs`. Depends on the prompt file and on the agent guide, so the button never links a missing page. The skill and the docs `llms.txt` generator are already required by the guide task; do not wait on the build-check task.

Landing theme tokens live in `landing/src` (CSS variables such as `--txt` and `--txt-dim` in `App.vue`). Docs theme: `user-docs/.vitepress/theme/custom.css` and `theme/index.ts`. Do not hard-code colors. Rebuild with each site's `bun run build` (`landing-build` and `user-docs-build` already run from `repoos check` when those trees change).

Out of scope: provider logos, a public MCP server, and changes to install command tabs.

## Activity

- 2026-10-20T16:02:35Z · created · njachowski@gmail.com

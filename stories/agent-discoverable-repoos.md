---
name: Agent-discoverable RepoOS
number: "0011"
created_at: "2026-10-20T15:29:53.553Z"
created_by: hello@repoos.org
---
# Agent-discoverable RepoOS

A developer who already uses a coding agent should be able to point that agent at https://repoos.org and have it understand RepoOS, check whether it fits the current Git repository, and help install and initialize it. The agent should do that from a short, accurate, canonical set of files, with progressive disclosure, and without a provider-specific integration.

The audience is a small team or an independent developer using Claude Code, Codex, OpenCode, Cursor, or another compatible agent. The experience should stay cheap to read: a short index first, the full manual only when an agent asks for it, and one starter prompt shared by every public surface.

## What already exists

Public docs live in `user-docs/` (VitePress 1.6, clean URLs, Cloudflare Pages, output `.vitepress/dist`). That tree is the manual for people adopting RepoOS. This repo's `docs/` is build context for RepoOS itself and must stay out of the public agent index.

The marketing site is `landing/` (Vite + Vue, static `public/` copied to the dist root, Cloudflare Worker asset fallback). The preferred install command, already shown in `landing/src/components/InstallBox.vue` and `user-docs/getting-started.md`, is `curl -fsSL https://repoos.org/install | bash`, with Homebrew, npm, Bun, pnpm, and mise beside it. `repoos init` scaffolds `repoos/work/`, `repoos/docs/`, and `AGENTS.md` by default. The public repository is https://github.com/repo-os/repoos.

`skills/` is the in-app skill directory RepoOS loads for a managed repo. A portable onboarding skill published for outside agents does not belong there.

`user-docs/getting-started.md` is a file, so a nested `getting-started/ai-agents.md` would collide with the `/getting-started` clean URL. `user-docs/running-with-agents.md` already covers driving a board after RepoOS is installed. The new guide is the earlier step: hand an unfamiliar agent the website and let it set the tool up.

`repoos check` already builds `user-docs/` and `landing/` when those trees change. Agent files should fail those existing builds when they are missing or inconsistent, rather than adding a separate checker.

## Outcomes

1. `https://repoos.org/llms.txt` is a short, valid [llms.txt](https://llmstxt.org/) overview: what RepoOS is, who it is for, core concepts, the verified install commands, and links to getting started, the CLI, the agent guide, the skill, the GitHub repository, and the docs site.
2. `https://docs.repoos.org/llms.txt` is an index generated from `user-docs/` Markdown, and `https://docs.repoos.org/llms-full.txt` is the consolidated manual for agents that want it. Relevant pages are also fetchable as raw Markdown. Existing HTML URLs stay as they are.
3. A portable RepoOS Agent Skill follows the [Agent Skills specification](https://agentskills.io/specification). `SKILL.md` is short. Deeper workflows live in linked references and on the docs site. Commands and flags match the real CLI.
4. One canonical starter prompt is the only copy of that text. The landing page and the docs homepage both render the same compact call to action from it: the heading "Building with an AI coding agent?", one sentence of explanation, a short preview, a **Copy prompt for your agent** button with success feedback, and a secondary link to the agent guide.
5. A human-readable guide at `https://docs.repoos.org/ai-agents` explains the approach, embeds that same prompt, and links `llms.txt`, the skill, install, init, and the existing getting-started and CLI pages. It includes permission guidance: inspect the repository first, preserve existing files and Git changes, and ask before significant edits.
6. A recorded trial with at least one unfamiliar coding agent, in a disposable Git repository, shows the agent can discover the docs, explain RepoOS, choose a real install method, tell whether RepoOS is already installed, describe what init would change, and look up task and story commands without inventing any.

## Delivery slices

File these as separate tasks, in this order. Slices 1 and 2 can proceed together once the canonical prompt file exists. Slice 5 waits until the guide URL and the prompt file are real, so the buttons never advertise a missing page.

| Slice | Area | Depends on | Done when |
| --- | --- | --- | --- |
| **1. Canonical prompt and landing `llms.txt`** | landing | — | One source file holds the starter prompt. The landing build emits `/llms.txt` at the dist root (so the Worker serves `https://repoos.org/llms.txt`). The file follows llmstxt.org, stays short, and links only to URLs that exist or that later slices in this story add. The install lines match the commands already published on the landing page and in getting started. |
| **2. Docs index, full dump, and raw Markdown** | docs | — | The VitePress build writes `/llms.txt` and `/llms-full.txt` from `user-docs/` Markdown, excluding `README.md` and this repo's `docs/`. Pages that are useful alone are also available as raw Markdown, and current HTML routes still resolve. Prefer `vitepress-plugin-llms` if it works with VitePress 1.6 and the existing theme-boot plugin; otherwise a small `buildEnd` step over the same sources. No hand-maintained second copy of the manual. |
| **3. Portable Agent Skill** | docs | 1 | A skill directory in the public repo, outside `skills/`, with a short `SKILL.md` plus reference files. It covers what RepoOS does, how to detect an existing install, verified install commands, `repoos init` and the default `repoos/` layout, where tasks, docs, and `AGENTS.md` live, how to discover CLI commands, how to create tasks and stories, and how to avoid disturbing unrelated Git changes. Instructions are checked against CLI help and the current init behavior. `llms.txt` on both sites links to it. Distribution is one public location any compatible agent can fetch, with install notes in the guide. |
| **4. Agent getting-started guide** | docs | 1, 3 | `user-docs/ai-agents.md` is in the Getting started sidebar and uses the canonical prompt. It points at `llms.txt`, `llms-full.txt`, the skill, install, init, the CLI, and `running-with-agents` for the later operating loop. It states the inspect-first permission guidance and names common agents only as examples. |
| **5. Shared call to action** | landing, docs | 1, 4 | Landing and the docs homepage (`user-docs/index.md` plus a small theme component, because the copy button cannot be static Markdown) share the prompt source, the heading, the sentence, the preview, the button label, the success feedback, and the guide link. Each site uses its own theme tokens. The block stays compact on mobile and desktop and sits beside the existing install path. Accessible name, keyboard use, and a visible copied state are required. |
| **6. Build checks and an external-agent trial** | landing, docs | 2, 3, 5 | Each site build fails if its generated agent files are missing, if an install command drifts from the published commands, or if the two sites embed different prompt text. Internal links in the new files resolve. A written trial in a disposable repository records whether an agent with no prior RepoOS context could follow the path in outcome 6, including any wrong command it tried. Note token use and fetch count only as observations. |

## Out of scope

A public MCP server, a hosted agent, autonomous browser automation, new CLI features, and changes to task or worktree architecture. Provider-specific plugins or branded logos for every coding agent. Copying the user manual into the skill or into the landing `llms.txt`. Indexing this repo's internal `docs/` as if it were the product manual. Paid inference in CI. `agents.txt`, unless slice 2 finds a concrete client that reads it and the file can be generated from the same sources; otherwise record the decision and leave it out.

## Open questions

- **Plugin versus a short generator.** Decide in slice 2 after trying `vitepress-plugin-llms` on the current VitePress config. Keep the generator only if the plugin conflicts with theme boot, clean URLs, or the Cloudflare output path.
- **Raw Markdown URLs.** Use the plugin's default paths when they stay at the docs origin and do not shadow HTML routes. Document the pattern in `llms.txt` so agents do not guess.
- **Where the skill is installed from.** The source of truth is one directory in this repository. Slice 3 should pick a fetch path that several agents already support, and treat any Claude, Cursor, or Codex folder as an install target rather than a second copy.
- **Which agent runs the trial.** Use an agent already available on the machine. Adding accounts or a benchmark service needs a separate decision.

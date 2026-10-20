---
id: "0884"
title: Agent-file build checks and external-agent trial
type: feature
status: inbox
paths: [landing, user-docs, agent]
priority: p2
area: [landing, docs]
story: Agent-discoverable RepoOS
depends_on: ["0880", "0881", "0883"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T16:02:55Z"
updated_at: "2026-10-20T18:59:05Z"
---
## Problem
The agent files in this story are generated or shared across two sites. Nothing in the existing `landing-build` and `user-docs-build` steps fails the build when `llms.txt` is missing, when an install command drifts from the published commands, or when the landing page and the docs homepage embed different prompt text.

## Desired UX

`cd landing && bun run build` fails with a message that names the missing or inconsistent file when `landing/dist/llms.txt` is absent, when its install lines differ from the published six commands, or when the landing call to action is not the shared prompt. `cd user-docs && bun run build` fails the same way for `llms.txt`, `llms-full.txt`, raw-Markdown links that shadow HTML routes, and a docs homepage prompt that differs from `agent/starter-prompt.md`. Internal links in the new files resolve. A written trial, run in a disposable Git repository, records whether an agent with no prior RepoOS context could follow the public path.

## Acceptance criteria

- Both existing build commands fail, rather than a new `repoos check` step, when their generated agent files are missing. Cover that with a test or a build assertion in each site.
- Install commands in landing `llms.txt`, the skill, and `user-docs/getting-started.md` stay aligned. `mise use -g` in `landing/src/components/InstallBox.vue` and `mise use --global` in getting-started count as the same mise command. Any other drift fails the landing or docs build.
- The two sites' rendered prompt text is compared to `agent/starter-prompt.md`. A mismatch fails the build that embeds it.
- Internal links in landing `llms.txt`, docs `llms.txt`, `user-docs/ai-agents.md`, and the skill's relative links resolve. The docs HTML routes still build.
- A trial section on this task (`repoos update <id> --section Trial`) records one run in a disposable repository with an agent already installed on the machine. It states which agent, whether the agent discovered the docs, explained RepoOS, chose one of the six real install commands, told whether RepoOS was already installed, described what `repoos init` would change, and looked up task and story commands. It quotes any wrong command the agent tried. Token counts and fetch counts are observations only. Do not call a paid model from CI, and do not add a benchmark service. If no coding agent is installed, say that in the Trial section and stop; do not register for a new vendor.
- `agents.txt` stays out unless the docs-index task already recorded a reason to generate it.

## Notes for AI

Story: Agent-discoverable RepoOS, slice 6. Areas `landing,docs`. Depends on the docs index, the portable skill, and the shared call to action. Those tasks already depend on the prompt file and the guide, so this trial runs only after the public path exists.

`repoos.toml` steps `landing-build` and `user-docs-build` (`whenChanged` `landing/**` and `user-docs/**`) are the gates to extend. Do not add a third checker script. Do not commit `landing/dist` or `user-docs/.vitepress/dist`.

The trial is a written record on this task, not a new public page and not a change to task or worktree architecture. Out of scope: a public MCP server, a hosted agent, autonomous browser automation, new CLI features, and provider-specific plugins.

## Activity

- 2026-10-20T16:02:55Z · created · njachowski@gmail.com
- 2026-10-20T18:59:05Z · body: Problem (added 1, removed 1)

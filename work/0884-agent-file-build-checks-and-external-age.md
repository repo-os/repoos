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
updated_at: "2026-10-20T18:59:53Z"
---
## Problem
The agent files in this story are generated or shared across two sites. Nothing in the existing `landing-build` and `user-docs-build` steps fails the build when `llms.txt` is missing, when an install command drifts from the published commands, or when the landing page and the docs homepage embed different prompt text.

## Desired UX
`cd landing && bun run build` fails with a message that names the missing or inconsistent file when `landing/dist/llms.txt` is absent, when its install lines differ from the published six commands, or when the landing call to action is not the shared prompt. `cd user-docs && bun run build` fails the same way for `llms.txt`, `llms-full.txt`, raw-Markdown links that shadow HTML routes, and a docs homepage prompt that differs from `agent/starter-prompt.md`. Internal links in the new files resolve.

## Acceptance criteria
- Both existing build commands fail, rather than a new `repoos check` step, when their generated agent files are missing. Cover that with a test or a build assertion in each site.
- Install commands in landing `llms.txt`, the skill, and `user-docs/getting-started.md` stay aligned. `mise use -g` in `landing/src/components/InstallBox.vue` and `mise use --global` in getting-started count as the same mise command. Any other drift fails the landing or docs build.
- The two sites' rendered prompt text is compared to `agent/starter-prompt.md`. A mismatch fails the build that embeds it.
- Internal links in landing `llms.txt`, docs `llms.txt`, `user-docs/ai-agents.md`, and the skill's relative links resolve. The docs HTML routes still build.
- `agents.txt` stays out unless the docs-index task already recorded a reason to generate it.

## Notes for AI


## Activity

- 2026-10-20T16:02:55Z · created · njachowski@gmail.com
- 2026-10-20T18:59:05Z · body: Problem (added 1, removed 1)
- 2026-10-20T18:59:09Z · body: Desired UX (removed 1)
- 2026-10-20T18:59:13Z · body: Acceptance criteria (removed 6)
- 2026-10-20T18:59:17Z · body: Notes for AI (removed 3)
- 2026-10-20T18:59:45Z · body
- 2026-10-20T18:59:49Z · body: Desired UX (added 1)
- 2026-10-20T18:59:53Z · body: Acceptance criteria (added 5)

---
id: "0990"
title: "Starter prompt and init docs: new-project path and one accurate list"
type: chore
status: done
priority: p2
area: docs
merged_commit: b37a480d18d4e585276dc6c26f917268871761d6
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/starter-prompt-and-init-docs-new-project
created_at: "2026-10-31T08:31:03Z"
updated_at: "2026-10-31T13:07:30Z"
last_close_out_gate_ms: 391946
last_close_out_gate_at: "2026-10-31T13:07:30.646Z"
review_passes: 1
---
## Problem

Outside AI agents follow the starter prompt (repoos.org/llms.txt and the ai-agents page) and hit gaps:

1. It only covers adding RepoOS to an existing repo. The new-project path is missing; the non-interactive route is `repoos init <name> --new --description ... --areas ... --no-launch`, run outside a git repo (do not `git init` first).
2. "What init creates" disagrees: the starter prompt says 3 things and "touches nothing else", getting-started lists 4, existing-repo lists 7. In v0.5.72 init also creates repoos.toml, .env.example, .gitignore, repoos/.repoos/canary.txt and an initial commit.
3. `repoos serve` starts background agents, including the CTO board monitor that launches a coding agent every 5 minutes, and nothing tells an agent to check before running serve.
4. The init output links "user-docs/configuration.md", a source-repo path.

## Desired UX

One accurate init list everywhere, the new-project flow in the starter prompt, and serve's background agents documented with how to disable them.

## Acceptance criteria

- [ ] The starter prompt, getting-started and existing-repo pages all give the same init list, matching what init actually creates today (verify by running init in a scratch directory).
- [ ] "touches nothing else" is removed or made true.
- [ ] The starter prompt documents the new-project flow with the exact flags above.
- [ ] Docs say what `repoos serve` starts, including the CTO monitor interval, and how to turn it off (`enabled = false` on that agent in repoos.toml), and tell agents to check this before running serve.
- [ ] The init output links https://docs.repoos.org/configuration instead of the source path.
- [ ] Every command and flag shown was checked against `repoos --help` and the docs; none invented.

## Notes for AI

Docs and init output text only. Keep the llms index checks passing (`llms index check`, `agent guide check`), and keep the starter prompt identical on the ai-agents page and agent/starter-prompt.md.

## Activity

- 2026-10-31T08:31:03Z · created · njachowski@gmail.com
- 2026-10-31T08:31:34Z · status inbox→ready
- 2026-10-31T12:22:32Z · status ready→active, branch
- 2026-10-31T12:56:21Z · status active→review
- 2026-10-31T12:56:29Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-31T12:57:45Z · note: review pass 1: good to go
- 2026-10-31T13:07:30Z · close-out gate completed in 392s


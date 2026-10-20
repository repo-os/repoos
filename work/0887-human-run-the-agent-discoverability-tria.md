---
id: "0887"
title: "Human: run the agent-discoverability trial with an unfamiliar coding agent and record it"
type: chore
status: inbox
priority: p2
area: [docs, landing]
story: Agent-discoverable RepoOS
depends_on: ["0884"]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T18:58:47Z"
updated_at: "2026-10-20T18:58:47Z"
---
## Problem
Story #0011 (Agent-discoverable RepoOS) needs evidence that a coding agent with no prior RepoOS context can follow the public path (landing and docs llms.txt, the agent guide, the portable skill). That requires a real run with an agent installed on a person's machine, in a disposable Git repository, which an unattended engineer cannot honestly do. Split out of #0884 so the code and build-check work can land without it.

## Desired UX
A written trial record on this task shows whether an unfamiliar agent could discover the docs, explain RepoOS, choose a real install method, tell whether RepoOS is already installed, describe what `repoos init` would change, and look up task and story commands, with any wrong command it tried quoted.

## Acceptance criteria
- A trial section on this task (`repoos update <id> --section Trial`) records one run in a disposable repository with an agent already installed on the machine. It states which agent, whether the agent discovered the docs, explained RepoOS, chose one of the six real install commands, told whether RepoOS was already installed, described what `repoos init` would change, and looked up task and story commands. It quotes any wrong command the agent tried. Token counts and fetch counts are observations only. Do not call a paid model from CI, and do not add a benchmark service. If no coding agent is installed, say that in the Trial section and stop; do not register for a new vendor.
- The result is written with `repoos update <id> --section Trial --section-body ...`.
- Any gap found (a wrong command, a missing link, an unclear step) is filed as its own task with `repoos new`.

## Notes for AI
Human task: do not start it. It depends on #0884 landing (the build checks) and on the whole public path from story #0011 being live (#0879-#0883). Use an agent already available on the machine; token and fetch counts are observations only. Do not call a paid model from CI and do not add a benchmark service.

## Activity

- 2026-10-20T18:58:47Z · created · njachowski@gmail.com

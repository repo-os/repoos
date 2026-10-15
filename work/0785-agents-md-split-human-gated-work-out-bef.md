---
id: "0785"
title: "AGENTS.md: split human-gated work out before Move to done"
type: chore
status: active
priority: p3
area: docs
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/agents-md-split-human-gated-work-out-bef
created_at: "2026-10-14T15:36:57Z"
updated_at: "2026-10-15T17:18:01Z"
---
## Problem
When a task is flagged `needs_input_reason: needs-human-step`, nothing in AGENTS.md tells an agent driving the board what to do at close-out. On 2026-10-14 an interactive session ran Move to done on #0660 while it carried that flag. The landed code needed no human, but the human-only verification was split out afterwards (#0784) instead of before close-out. The human's rule is: never close out human-gated work as if the human part were done. Land only the scope an agent can finish, and split the human part into its own task first.

## Desired UX
An agent that is about to run `repoos done <id>` on a task flagged needs-human-step does these steps in order:
1. Confirm that the scope being landed needs no human (tests use fakes; nothing depends on a real device, account or third-party sign-up).
2. If any acceptance criterion does need a human, file that part as a new task first: `repoos new "<title>" --depends-on <id>`, then `repoos update <new> --assigned-to human --hold true`. `repoos new` defaults to assigned_to ai, so the reassignment is required.
3. Narrow the original task to the agent-doable scope if needed, and only then close out.
4. If the human-gated part cannot be separated from the code, do not close out. Report it to the human.

## Acceptance criteria
- AGENTS.md has a short rule covering the steps above, placed in "Review and sign-off" or "Interactive / external sessions" next to the Move to done guidance, and naming #0660/#0784 as the worked example.
- The rule applies to both interactive sessions and the CTO/driver path. If the CTO autopilot or driver brief can trigger Move to done (docs/cto-autopilot.md), that doc says the same thing, or this task records why it does not apply.
- No contradiction with user-docs/review-and-close-out.md. Fix the line there if one exists.
- Docs-only change; `repoos check --changed main` passes.

## Notes for AI
Keep it to a few lines in the existing style; do not restructure AGENTS.md. Do not edit the `repoos init` AGENTS.md template in src/commands/init.ts unless you can justify it for every managed repo, and say so in the handoff.

## Activity

- 2026-10-14T15:36:57Z · created · njachowski@gmail.com
- 2026-10-15T11:02:17Z · status inbox→ready
- 2026-10-15T17:18:01Z · status ready→active, branch

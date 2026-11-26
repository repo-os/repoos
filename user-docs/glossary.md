# RepoOS glossary

RepoOS uses a mix of task lifecycle names, review language and shorthand. This
page defines them as they behave in the product. For the full lifecycle, see
[Concepts](/concepts) and [Review and close-out](/review-and-close-out).

| Term | Definition | UI, command or status |
| --- | --- | --- |
| active | A task being worked; its engineer works in a dedicated Git worktree. | Status `active` |
| API | Application programming interface; RepoOS's HTTP interface used by the UI, CLI and integrations. | `/api/...` routes |
| back to the drawing board | Review verdict meaning the implementation misses the mark enough to need a substantial rethink. | Review verdict |
| close-out | The server-owned process that merges an approved task branch into the base branch, validates it and records completion. | Move to done / `repoos done <id>` |
| CLI | Command-line interface: the `repoos` terminal command. | `repoos --help` |
| CTO | Chief technology officer; RepoOS's CTO agent monitors policy and escalations. | CTO monitor |
| CTO monitor | Background agent that watches task and engineering activity for policy issues and human escalations. | Agents settings |
| done | A task approved and merged into the base branch. | Status `done` |
| draft | An early task state used before the task is ready for normal engineering work. | Status `draft` |
| driver | The agent or person coordinating the task board and keeping engineering work moving. | `repoos driver brief` |
| easter eggs bundle | One p2/p3 RepoOS task that groups three to six small, independent polish items. | Task title format `Easter eggs bundle: …` |
| engineer | The agent implementing a task in its task worktree and preparing it for review. | Engineer agent |
| gate | A required validation step that must pass before a workflow can proceed, such as the handoff check. | `repoos check`; handoff gate |
| g2g | Nick's shorthand for the `good to go` review verdict. | Review verdict |
| good to go | Review verdict meaning no blocking issue prevents sign-off; the task still needs the close-out/approval step to become done. | Review verdict |
| handoff | An engineer's request for RepoOS to check and send the task to review; it is not itself a status change. | `repoos mv <id> review` or `::repoos-handoff-ready::` |
| hold | A durable task state that stops the current run and makes the task inert to all automation until released. | `repoos hold <id> --reason "…"`; `repoos unhold <id>` |
| inbox | A captured task that is not yet specified well enough to act on. | Status `inbox` |
| landable | A review task that satisfies the current review, clean-worktree, branch-merge and other close-out preconditions. | `repoos landable <id>` |
| MTD | Nick's shorthand for **Move To Done**, the UI action for a task with a passing review. It invokes the real close-out pipeline. | Move to done / `repoos done <id>`; not `repoos mv <id> done` |
| narrow resolution | A limited, evidence-based merge-conflict repair for conflict classes RepoOS has explicitly proven safe to resolve automatically. | Close-out conflict resolution |
| needs_input | A task flag saying progress is waiting on a human or another explicit intervention; it is not a lifecycle status. | `needs_input` task field |
| needs some work | Review verdict meaning the implementation is close but has findings that should be fixed before approval. | Review verdict |
| OTP | One-time passcode used during email sign-in. | Authentication |
| pass | One completed review attempt, numbered in the task's review history. | `review-<n>.md` |
| pause | Stops the current task run while leaving the task resumable; it does not block all automation like a hold. | `repoos pause <id>` |
| pressureGuard | RepoOS's resource-pressure check that can defer starting work when the machine is under pressure. | `repoos stats`; driver brief |
| preview | A server-managed, read-only view of a task worktree used to inspect its running app. | Preview action / `::repoos-preview-request::` |
| ready | A specified task that an agent or person can pick up as-is. | Status `ready` |
| reviewer | The agent that examines an engineer's handoff, reports findings and gives a review verdict. | Reviewer agent |
| review | A task state waiting for review/sign-off after implementation and checks. A review request may be processed before the status changes. | Status `review` |
| round | One engineer handoff and its associated immutable engineering report; later fixes create another round. | `round-<n>.json` |
| shot | A declared screenshot capture describing a route and state a reviewer should inspect. | `repoos update <id> --shots …` |
| status | The task's lifecycle field in Markdown frontmatter; RepoOS changes the field without moving the task file. | `draft`, `inbox`, `ready`, `active`, `review`, `done` |
| UI | User interface; RepoOS's web app for viewing and operating the task board. | Web app |
| worktree | A separate Git checkout and branch where one task's code is changed in isolation. | Git worktree |

## Task statuses

RepoOS currently defines `draft`, `inbox`, `ready`, `active`, `review` and
`done` as lifecycle statuses. `hold` and `pause` are controls/conditions, not
status values: hold blocks all automation until released, while pause stops the
current run and can be resumed. See [Hold and unhold](/cli#hold-unhold-a-task-out-of-all-automation-0960).

## Review verdicts

| Verdict | Meaning |
| --- | --- |
| back to the drawing board | The work is off the mark and needs a substantial rethink. |
| good to go | The review found no blocking issue; approval and close-out remain separate. |
| needs some work | Findings should be fixed before approval. |

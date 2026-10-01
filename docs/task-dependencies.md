# Task dependencies

`depends_on` is an optional list of task ids in task frontmatter. A prerequisite
is satisfied only when its task is `done` and Git proves the exact merged
commit is an ancestor of the local `main` (or `master` when that is the repo's
main branch). Status alone is not proof: a plain `repoos mv <id> done` can
leave the dependent blocked.

The completed task's `merged_commit` records the branch tip verified at
close-out. The normal close-out removes the feature branch after publishing;
recording the commit id before cleanup preserves ancestry proof without
retaining worktrees or branch refs. Dependency blocking is always recomputed
from task files and Git state; it is never a task status.

The API and CLI validate dependency writes against the current task graph,
rejecting unknown ids, self-references, and cycles. Auto-engineering filters
blocked ready tasks before asking the PM to select work. Manual Start returns a
409 with the blocking task ids; the UI presents an explicit start-anyway
confirmation, which sends a one-request override without changing the task's
dependency metadata.

When a prerequisite with dependents completes close-out, the server reruns
auto-engineering reconciliation with the `dependency-merged` trigger, so newly
eligible work is considered without a server restart.

If an upstream task is deleted, or its completed branch has no verifiable
merge commit, the dependent reports a cancelled prerequisite that needs human
attention. A still-existing but unmerged branch remains an ordinary waiting
dependency. Explicitly abandoning an upstream also marks its dependents as
needing human attention; starting that upstream again clears the abandoned
state.

# Check-run history: which project owns a row (#0870)

## Check-gate bookkeeping and drift (#1061)

The server holds a per-task worktree lock during gated validation. RepoOS
bookkeeping commits under `work/**` and `.repoos/**` are deferred until the gate
releases that lock; queued writes retain individual file snapshots so repeated
updates are replayed as separate commits in enqueue order. Server restart
reconciles dead holders and drains their durable queues. RepoOS refuses to
start another managed engineer turn with `A check is running; wait for it to
finish.` and rejects source commits. Edits that bypass those managed paths are
detected by the post-check drift comparison.

After validation, drift inspection examines the intervening commits as well as
the net tree difference between the check-start commit and resulting HEAD.
Changes under those bookkeeping roots are allowed; any other path touched by an
intervening commit invalidates the result, even if a later commit reverts it.
The refusal names the commit subjects and paths. If Git cannot compute the
changed paths or inspect the commit history, validation fails closed. A merge
whose checked tree is its second parent is judged against that checked tree,
not unrelated first-parent history.

Every net source path must be explained by an inspected commit. If the final
tree differs from the check-start tree but the available commit history cannot
account for a changed source path, the check fails closed and names that path
with a `history could not be explained` reason.

Tracked gitlinks are fingerprinted from their own repository boundary: an
initialized submodule includes its checked-out commit and porcelain status,
while an uninitialized gitlink uses the object id in the parent index. Nested
repositories without commits are recorded as unborn repositories plus their
status, rather than inheriting the parent repository's `HEAD`. Symlinks record
their link text; changes to a symlink target outside the worktree are not
followed or detected.

An already-running engineer can still edit source files directly during a
check; filesystem writes cannot be reliably fenced. RepoOS compares hashes of
tracked and non-ignored untracked source files before and after validation, so
an edit to an already-dirty file or a newly created source file invalidates the
result. A direct, uncommitted edit that is restored before the final snapshot
is outside the guarantee; committed source changes, including a commit and
revert, are detected from history. This is an accepted limitation, not a
write-blocking guarantee.

Every `repoos check` execution records one row in `<project>/.repoos/checks.db`
(cacheDir from that project's `repoos.toml`). The store is how the server's
Checks → Runs surface, slow-run detection and the next run's failed-test
ordering see a gate that already finished.

## Rule: the worktree decides, never the environment

A run's store root is **always derived from the git project that contains the
worktree the check ran in** (`resolveCheckStoreRoot` in
`src/core/check-store.ts`, via the main checkout of its git common dir). It is
never taken from the process cwd, and an inherited
`REPOOS_CHECK_STORE_ROOT` is only a hint:

- Same project → the row goes to that project's main checkout, normalised
  through the linked worktree. This is how a standalone `repoos check` inside a
  task worktree lands in the history the server reads instead of a per-worktree
  file.
- Different project → the hint is ignored with one clear
  `[repoos] ignoring REPOOS_CHECK_STORE_ROOT=…` warning per process. The run
  still records into its own project.

Caller attribution follows the same rule. `REPOOS_CHECK_TASK_ID` /
`REPOOS_TASK_ID` is trusted only when it belongs here: a numeric id must have a
`<workDir>/<id>-*.md` task file in this project, and a `REPOOS_ROOT` naming
another repo invalidates the inherited attribution. A work dir that does not
exist yet proves nothing (a server-managed run in a repo with no task files
keeps its id — #0695), so only a work dir that *is* inspectable can reject an
id. When an id is rejected the run records task-less, or with the id resolved
from its own checked-out branch.

Attribution is resolved against the **execution worktree**, not the store root:
the branch that names a task is checked out there, while the main checkout that
receives the row is usually still on `main`. Remote rows go through the same
check (`validateCheckTaskId`), so a polluted `opts.taskId` in-process is
recorded task-less rather than attributed to another project's task.

## Incident (2026-10-20)

A check run in a LightingAI worktree inherited `REPOOS_CHECK_STORE_ROOT` from
the RepoOS checkout, while its own config's relative cache dir was
`repoos/.repoos`. The row therefore landed at
`<repoos-checkout>/repoos/.repoos/checks.db` — a nested `.repoos/` that the
root-level `.repoos/*` ignore rule did not cover — and blocked two green task
close-outs with "main has 3 uncommitted files". A RepoOS task id leaked into
the same rows from the shared process environment.

Two guards exist for this:

- the store root and attribution validation above (foreign env can no longer
  redirect a row), and
- the root `.gitignore` matching `**/.repoos/*` at any depth, so even a
  correctly-derived nested cache (or a stray one from an older build) is
  ignored. `!.repoos/canary.txt` keeps the root canary task tracked.

Cross-project servers share a machine and one `repoos` binary, so process-level
environment is shared surface: never treat an inherited `REPOOS_*` routing var
as proof of which project a run belongs to.

## Tests

`src/ui-app/tests/check-store-project-root.test.ts` builds two temporary
projects with different layouts (root cache vs nested `repoos/.repoos`), runs
from one project's linked worktree with the other project's
`REPOOS_CHECK_STORE_ROOT` / `REPOOS_TASK_ID` / `REPOOS_ROOT` set, and asserts
that only the owning project's cache gains rows.

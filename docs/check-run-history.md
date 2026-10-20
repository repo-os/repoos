# Check-run history: which project owns a row (#0870)

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

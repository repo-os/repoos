# Concepts

## The repo is the source of truth

A task is a markdown file in your configured task directory (`repoos/work/` on
a fresh install). Its status is a field in that file's
YAML frontmatter. There's no board database behind the UI — the UI is a view
over the files, and anything derived (the index, caches) can be deleted and
rebuilt.

This has practical consequences you'll feel immediately:

- Tasks are versioned, diffable and reviewable like code.
- Task history travels with a clone. Nothing lives in a service you can lose
  access to.
- An agent can read the board with `cat`, and your project's context is sitting
  right next to the code it describes.

## Git history in the UI

The Context page (`/repo`) includes a **History** tab: the repository's `git
log`, grouped by day, with branch and path filters. Commits that follow the
`type(NNNN):` message convention (for example `docs(0514): …`) link to that
task. Opening a commit shows the files it changed and a full diff — the same
diff view used for task worktrees.

The log is read-only. Checkout, revert, and cherry-pick stay on the command
line.

The left sidebar also shows a small **canary** digit (0–9) above the git
summary. Clicking it starts a deliberately trivial task that walks the full
lifecycle (draft through done) by incrementing the digit in
`.repoos/canary.txt` in your repo — a smoke test that any failure is in the
pipeline, not your product code. The digit reflects that file on disk and
advances after a canary run merges.

The git row below it is a one-line summary of the checkout you are actually
running from: the branch, and `clean`, `dirty (n)` or `unknown`. It
describes the **repo root checkout only** — task worktrees are separate, and a
task branch moving never flips it. A warning colour means either the checkout
is not on the base branch (or HEAD is detached) or there are uncommitted
changes; `unknown` is what you see when git could not be read or the last
check is older than a minute and a half, and it never means clean.

The ℹ button next to it opens the detail: the changed files with their status
letters when dirty, the three most recent commits exactly as the History tab
lists them (`docs(NNNN):` bookkeeping excluded), how long ago the state was
checked, and a link into History. It reads the same data as the History tab
and is read-only — committing and switching branches stay on the command line.

The state is pushed to every open tab over the event stream when it changes
(working-tree writes, branch switches, commits, staging, and RepoOS's own
task-file commits), with focus, tab-visibility, reconnect and a slow interval
as backstops.

One cadence note: git's own state changes are pushed immediately, but an
ordinary edit outside the task tree (say, under `src/`) is not watched —
watching the whole checkout would be a lot of filesystem noise for one
indicator. Those edits show up on the next backstop (window focus, tab
visibility, event-stream reconnect, or the 45-second interval), so the row can
be up to ~45 seconds behind an edit made with a plain text editor. Staging or
committing that edit pushes it at once.

## Status is a field, not a folder

```yaml
---
id: "0001"
title: Fix the login redirect loop
status: ready
priority: p1
---
```

Tasks move through `inbox → ready → active → review → done` by editing that one
field in place. Files never move between directories, so a status change is a
one-line diff instead of a rename, and two people moving different tasks never
conflict.

::: warning Don't hand-edit task files
Status, activity log and metadata are written by RepoOS so the board stays
consistent. Use `repoos mv`, `repoos update`, `repoos note`, or the UI.
:::

## What each status means

| Status | Meaning |
| --- | --- |
| `inbox` | Captured, not yet specified well enough to act on. |
| `ready` | Specified. An agent (or person) can pick this up as-is. |
| `active` | Being worked, in its own git worktree. |
| `review` | Implementation finished and checks pass. Waiting on a human. |
| `done` | Approved and merged. |

## Archiving a task

Archive parks a task you don't intend to finish right now **without changing
its status**. A task archived from `review` is still `review` underneath — it
just stops appearing in the board columns, and unarchiving drops it back into
that same column. Nothing else changes: the branch and worktree are kept, so an
archived task resumes exactly where it left off.

Use **Archive task** at the bottom of the task panel and optionally give a
reason. Archiving is refused while a run, review, preview, or close-out is
still live, because hiding a half-stopped run from the automatic scanners
would orphan it — stop the work first.

Archived tasks live in a minimised **Archived (n)** list below the board on the
Work Queue page. Archiving is orthogonal to status: there is no `archived`
status, and it never merges, stops, or deletes anything.

From the CLI, `repoos list` hides archived tasks by default and prints a count;
`repoos list archived` shows them, and `repoos show <id>` marks an archived
task. `repoos mv` refuses to move an archived task's status — unarchive it
first (from the Archived list, or `POST /api/tasks/:id/unarchive`).

An archived task that another task `depends_on` does **not** count as done:
the dependent stays blocked and reads *“Blocked by archived task #id; unarchive
it to unblock”* until the upstream is unarchived.

## One task, one worktree

When a task goes active, RepoOS creates a dedicated git worktree and branch for
it. The agent works there — never in your primary checkout — so you can keep
working while an agent does, and several tasks can be in flight without
stepping on each other.

## Checks before merge

```bash
repoos check
```

This is the single bar for "did this break anything?". It runs the check plan
your repo declares in `repoos.toml` — the same command for Go, Gradle/Android,
Rust, JavaScript or a mix — and each step ends in a pass, a failure, a timeout,
a missing-prerequisite error, or an explicitly-stated skip (see
[Checks before merge](/check)). An agent must get it green before handing work
back, and it runs again before anything merges.

Because it's one command with a non-zero exit code on failure, the same checks
works locally, in CI, and inside RepoOS's own close-out pipeline.

## Humans hold the merge

An agent that finishes a task asks for it to move to `review` and **stops**. It
does not merge its own branch, and it can't — the merge happens only when a
human moves the task to `done`.

Reaching `review` is a request, not a status edit: RepoOS commits the branch,
runs `repoos check` and passes a commit guard first, from whichever route you
use (the **Review** button, a board drag, `repoos mv`, or the agent). Until that
finishes the task is still `active`. See
[Review and close-out](/review-and-close-out).

If a reviewer agent is enabled, it reads the branch diff and writes an advisory
report for that review — findings, edge cases, suggestions. It changes nothing
and it doesn't replace your approval; it's there to make your review faster.

## Your docs directory is the project's memory

`repoos init` creates `repoos/docs/` alongside `repoos/work/` by default. It holds the
context an agent needs to work on *your* project: architecture notes, decisions
and their rationale, incident write-ups, conventions that aren't obvious from
the code.

This matters more than it sounds. An agent starting a task reads `AGENTS.md` and
your configured docs directory to get oriented — so knowledge you write down once stops being
re-derived, re-litigated, or re-broken on every future task.

::: tip
Your docs directory is for building *your* project. The documentation you're reading now —
how to use RepoOS itself — is a separate thing, kept in its own directory in the
RepoOS repo.
:::

## AGENTS.md

`AGENTS.md` is the cross-tool standard for agent instructions, read directly by
Claude Code, Codex, Cursor, Aider, Zed and others. `repoos init` scaffolds one
describing the task lifecycle and the rules of your repo. Add a one-line shim
only if a tool you use ignores it.

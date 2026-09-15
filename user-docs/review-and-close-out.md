# Review and close-out

A task only reaches `done` through review. This page covers the two halves of
that: the **review gate** — what happens while a task sits in `review` — and the
**close-out pipeline** that runs when you move it to `done`.

## Why an agent can't merge itself

When an agent finishes a task it moves it to `review` and stops. It does not
merge its own branch, and it can't: the merge happens only when a human moves
the task to `done`. That's the whole design — agents do the work, you hold the
sign-off gate.

## The reviewer agent

If a reviewer is enabled on the [Agents](/agents) page, RepoOS runs it
automatically the moment a task lands in `review`. The reviewer reads the
branch's diff in the task's own worktree and writes a short report — bugs, edge
cases, suggestions — shown in the task drawer next to **Move to done**.

It's advisory. It changes nothing and never replaces your sign-off. Its verdict
is one of three lines:

- `` `good to go` `` — correct and complete.
- `` `needs some work` `` — close, but worth fixing first.
- `` `back to the drawing board` `` — off the mark.

### Auto-bounce: why a task can move back to `active`

The reviewer runs on **every** `review`, not just the first one. If new commits
land on the branch while the task sits in `review` — you pushed a fix, or an
agent did — RepoOS reviews the new head again. A verdict of anything other than
"good to go" **auto-bounces** the task back to `active`: the findings are sent
to the engineer session, which is expected to fix them and re-hand off to
review. The task's `review_rounds` counter goes up.

This is deliberate self-correction, not a failure. If you move a task to review
and then find it back in `active`, check its activity log — you'll see the
review round and the findings that caused it.

Auto-bounce is capped at **2 rounds** (`MAX_AUTO_REVIEW_ROUNDS`). Past that,
RepoOS stops and leaves the task for a human rather than looping forever. It
also stops early and escalates if the reviewer flags the task's own relevance —
an obsolete task needs a scoping decision, not more engineering.

## Sign-off

When you're happy, move the task to `done` — from the board, the task drawer,
or `POST /api/tasks/:id/done`. That's what starts the close-out pipeline. Until
then the worktree stays open and nothing has merged.

## The Move-to-done pipeline

Close-out runs as a job with five phases. It works in a **separate candidate
worktree** (`repoos-worktrees/<repo>/integrate/<id>` on branch
`repoos/integrate/<id>`), never on your main checkout, so a failed close-out
can't leave your working tree dirty.

1. **queued → syncing** — first runs a cheap, non-destructive pre-check of
   whether the branch really conflicts with `main`; a real source conflict skips
   straight to the automatic repair below, without building a candidate. Otherwise
   it creates (or resets) the candidate worktree from current `main` and symlinks
   `node_modules` from your main checkout.
2. **syncing → validating** — merges the task's feature branch into the
   candidate. Generated files that routinely differ — `dist/`, `screenshots/`,
   and the task's own `work/<id>-*.md` bookkeeping file — are auto-resolved.
3. **validating** — re-checks `main` first: if it advanced since the candidate
   synced, the job discards the candidate and resyncs before validating. Then
   it builds and runs `repoos check`. A real check failure stays in the branch:
   fix it there and retry.
4. **publishing** — takes the repo lock, confirms `main` hasn't moved again,
   and fast-forward-or-merges the candidate into `main`. If `main` did move, it
   goes back to step 2 and self-heals.
5. **cleanup → done** — removes the candidate and the task's own worktree and
   branch, and marks the task `done`.

A **docs-only fast path** skips the build and check when the merged diff touches
nothing but docs — every changed path under `docs/` or `user-docs/`, or ending
in `.md`. There is no "mostly docs" scoring; any other path runs the full gate.

### Merge conflicts repair themselves

The first time two tasks are in flight at once, one of them may conflict with
`main` on a real source file. This is **expected behaviour, not a failure
state**:

- A conflict on a generated/bookkeeping path (`dist/`, `screenshots/`, the
  task's own file) is auto-resolved silently.
- A conflict on **anything else** is non-retryable — retrying would derive the
  same conflict. RepoOS automatically hands off to an engineer session **in the
  feature branch's own worktree** to merge `main` into the branch and resolve it
  there. When that session finishes, close-out is re-enqueued and retries on its
  own.

So a task that appears to bounce between `active` and `review`, or re-runs its
engineer, is usually a conflict repairing itself. You don't have to click
anything; watch the activity log for the reason.

## Previewing a task's changes

You can preview the running app from a task's branch without merging it. Click
**Preview** on an `active` or `review` task and RepoOS starts a read-only
instance from the task's worktree at an OS-assigned port.

Previews are **server-owned and on demand**: nothing auto-launches one, and at
most **one preview runs at a time**. Requesting a new preview evicts whichever
one was running (FIFO). A preview stops on its own when the task leaves
`active`/`review`.

If your repo has [auth](/configuration#authentication) enabled, the preview
runs behind it like the rest of the server, so you'll hit a login screen even
locally — you don't need a real inbox, see the dev-login note in
[Troubleshooting](/troubleshooting#logging-into-a-local-preview). Auth is off
by default, so most repos skip straight to the running app.

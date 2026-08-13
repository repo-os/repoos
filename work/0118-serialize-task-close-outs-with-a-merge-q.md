---
id: "0118"
title: Serialize task close-outs with a merge queue and main-SHA validation
type: feature
status: done
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/serialize-task-close-outs-with-a-merge-q
created_at: "2026-08-12T04:47:03Z"
updated_at: "2026-08-13T17:40:43Z"
---
## Activity

- 2026-08-12T04:47:03Z · created · unknown


## Problem

RepoOS lets multiple review tasks enter `completeTask()` concurrently. Each
close-out can synchronize a feature branch, merge into the checked-out `main`,
rebuild tracked artifacts, run browsers/tests, update task state, and remove a
worktree. There is no repository-wide integration lock, queue, or compare-and-
swap check that the `main` commit tested by one close-out is still current when
that close-out publishes.

This has produced obvious conflicts and dangerous false successes: branches
race while merging; a task can be tested against an old main; a build can
trigger RepoOS self-reload after the merge committed but before close-out
finished; retry then treats a partial close-out as fresh; and task Markdown has
reached main with literal conflict markers even though Git reported success.
A failed post-merge gate can leave main changed or dirty while the task remains
in review, with no durable recovery phase.

Worktrees isolate implementation, but publication to one main branch is a
single-writer operation and must be coordinated by RepoOS.

## Desired UX

- Engineers continue working concurrently in separate worktrees.
- **Move to done** enqueues one durable integration job and shows whether it is
  queued, synchronizing, validating, publishing, or cleaning up.
- Close-outs for one repository publish strictly one at a time in FIFO order.
- RepoOS validates a merge candidate away from the live main checkout. Main
  remains clean and unchanged until the candidate passes the complete gate.
- If main advances before publication, RepoOS rebuilds the candidate from the
  new main SHA and validates it again.
- A server reload, browser disconnect, or retry cannot duplicate the merge or
  lose its phase. Only a fully verified candidate reaches main and `done`.

## Acceptance criteria

- [ ] Add a repository-scoped, server-owned close-out coordinator. It
      serializes publication across different tasks and exposes FIFO position.
- [ ] Enqueue is idempotent per task; repeated `/done` requests return the
      existing job instead of starting another `completeTask()`.
- [ ] Persist versioned integration-job state atomically under `.repoos/`.
      After restart, RepoOS safely resumes or reports a recoverable phase and
      never guesses that an interrupted job completed.
- [ ] Record `baseMainSha` when validation begins. Immediately before publish,
      compare it with current main; if main changed, discard the stale
      candidate, rebuild from the new SHA, and rerun the full gate.
- [ ] Build in a RepoOS-owned temporary integration worktree/branch based on
      main. Merge the feature branch, rebuild generated artifacts, and run
      `repoos check` there. Never dirty or partially merge live main while
      validating.
- [ ] Fail candidates with unmerged index entries, unexpected dirt, or text
      containing unresolved `<<<<<<<`, `=======`, or `>>>>>>>` markers.
- [ ] Publish only a green candidate while holding the repository lock, using
      an ancestry-checked fast-forward/compare-and-swap operation.
- [ ] Defer self-reload while an integration job owns the publication lock.
      After durable outcome recording, perform one controlled handover; a
      close-out build must not kill its coordinating server.
- [ ] After publish, set and commit canonical task status `done`, remove the
      task and integration worktrees, delete merged temporary/feature branches,
      and leave main clean.
- [ ] Failures retain phase, main SHA, candidate SHA when present, reason, and
      recovery action. Retry resumes safely and never repeats an already
      published merge.
- [ ] API/SSE expose queued/current jobs so task and Control views can explain
      why work is waiting.
- [ ] Tests cover two different tasks closing concurrently, duplicate
      requests, main advancing during validation, source conflicts, conflict
      markers in otherwise mergeable Markdown, build/check failure, restart in
      every phase, and cleanup after publish.
- [ ] An end-to-end test launches at least three close-outs concurrently and
      proves successful results are serialized, based on latest main, green,
      and leave a clean repository.
- [ ] `repoos check` passes.

## Notes for AI

- Prefer a candidate worktree over rollback of a failed merge on live main. Do
  not use `git reset --hard` as transaction recovery.
- The server is the sole privileged publisher. Agents request handoff/review;
  they never merge, mutate canonical state, or choose arbitrary paths.
- Do not auto-resolve source conflicts. Schema-aware task reconciliation may
  merge frontmatter/activity entries but must reject conflict markers.
  Generated artifacts are rebuilt from candidate source.
- Keep locking repository-scoped so separate repositories do not block each
  other.
- Likely touch points: `src/server/done.ts`, `src/server/server.ts`,
  `src/server/reload.ts`, `src/core/git.ts`, plus a focused integration-job
  module and tests.
- #0075 owns non-blocking HTTP/SSE UX and elimination of duplicate build and
  browser work. This task owns correctness: serialization, durable phases,
  candidate validation, SHA checks, and atomic publication.

## Related

- 0075 — asynchronous close-out UX/performance; implement on this coordinator.
- 0095 — automatic branch sync during review completion.
- 0113 — keeps generated artifacts out of feature commits.
- 0112 — agent supervision may surface stuck jobs but must not bypass this
  coordinator.

## Activity

- 2026-08-13T12:47:06Z · status ready→active, branch
- 2026-08-13T12:58:53Z · watchdog: automatic resume attempted
- 2026-08-13T13:08:03Z · watchdog: escalated to needs_input · handoff signal was not detected after the automatic resume · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-13T13:28:50Z · needs_input
- 2026-08-13T13:55:10Z · status active→review
- 2026-08-13T17:40:43Z · status review→done, release:success

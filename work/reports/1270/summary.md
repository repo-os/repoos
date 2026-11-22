## TL;DR

Task #1270 documented that drivers should queue every green review task for close-out at once instead of landing them one at a time. A "Queueing several close-outs" section went into `docs/close-out-pipeline.md`, a matching best-practice line into `docs/driver-notes.md`, and a single pointer line into `AGENTS.md`. Docs only — no code, config or `repoos.toml` changes. The review passed on the first round with verdict `good to go`, and the task closed out cleanly. One engineer round, one review pass, total agent cost about $0.046.

## Outcome

The task shipped documentation that makes the fast close-out pattern durable: drivers and agents reading the docs now learn that once a task is landable (green review), it should be queued for close-out immediately with `repoos done <id>`, without waiting for the previous close-out to finish; that each queued task gets its own job, runs in order, and publishes under a lock; that a failed job drops out of the queue and does not block the jobs behind it; and that machine load, not click timing, limits landing speed.

Concretely, three files changed:

- `docs/close-out-pipeline.md`: new `## Queueing several close-outs` section (+26 lines), placed between the busy-board guidance and the landable section. It covers the queued phase, `queuePosition` via `GET /api/tasks/<id>/integration-job`, running `repoos done` for each task without waiting, and failure handling.
- `docs/driver-notes.md`: +12 lines with a matching best-practice entry.
- `AGENTS.md`: one pointer line (+2/−1) linking to the new section, keeping the file at 27,652 bytes against its 30,000-byte limit.

Two things were verified rather than assumed before writing: `queuePosition` is 0-based and returns `-1` once a job is no longer pending (`src/server/routes/tasks.ts`), and `pendingCloseOutJobs` excludes `done`/`failed`, so failure handling behaves as documented (`src/server/integration-job.ts`). Also confirmed that the close-out timeout budget starts when a job leaves the queue, which is what makes "queue early" cost nothing against the timeout.

The task's "fix any contradicting one-at-a-time line" criterion turned out to be empty: a search of `docs/`, `user-docs/` and `AGENTS.md` found no such wording. The nearest match (in `docs/easter-eggs-bundles.md`) concerns the server-reload window, not queue ordering, and was left alone.

The driver-brief criterion was conditional ("if it lists landing steps"). The brief lists none — its only landing guidance is one generated sentence — so it was correctly left untouched; changing it would have been a code change this docs-only task ruled out.

**Final verdict:** review pass 1 returned `good to go` on 2026-11-20, and the task reached `done` with `release:success` (merged commit `3976d84dbe0589caca5f7d22fa16f95b012e6791`).

## Process stats

- **Rounds:** 1 engineering round, 1 review pass. No restarts or model swaps recorded.
- **Wall clock, created → done:** 2026-11-20T05:43:15Z → 2026-11-20T09:14:22Z, about 3h 31m. Most of that was the wait between the `good to go` review (05:49:03Z) and close-out (09:14:17Z), which included a queued message going overdue (see What went wrong).
- **Engineer:** `claude code` on `haiku`, started 05:43:39Z, elapsed 116s, 16,927 tokens, $0.03511241, finished.
- **Reviewer:** `opencode` on `opencode-go/glm-5.3-flash`, started 05:48:15Z, elapsed 48s, 30,221 tokens, $0.01136544, finished.
- **Routing:** model router (jev), model `unknown`, 0s, no token or cost figures recorded.
- **Token/cost totals where known:** 47,148 tokens and $0.04647785 across the two recorded agent sessions.
- **Close-out gate:** completed in 164s.
- **Shots:** none captured — the 5 changed paths touch no capture target's globs.

## What went wrong

- **CTO nudge reported "held — handoff gate is running"** at 05:46:28Z, shortly after the task went active. This was the normal handoff gate in progress; the task moved to review at 05:48:08Z without further intervention.
- **A queued message went overdue** — at 07:07:02Z the log records `message_overdue: still queued after 60m without being delivered` for the message queued at 05:48:09Z. The facts do not record how this resolved; the task nonetheless closed out successfully at 09:14Z.
- **Test-wrapper exit code quirk:** `bun run test src/core/agents-md-size.test.ts` ran the test (2 passed) but the wrapper exited 1. Running `bunx vitest run` on the same file exited 0. Not investigated further; the scoped `repoos check` passed.
- **Scoped check skips tests for docs-only diffs:** the full suite was reported as skipped, so the AGENTS.md size test was run by hand to confirm the 30 KB limit still holds.
- No crashes, stalls, failed gates or restarts are recorded.

## Learnings

- **Verify queue-behaviour claims in the code before documenting them.** Reading the handlers confirmed both the `queuePosition` semantics and that a failed close-out job does not block later jobs — the difference between guidance that is true and guidance that sounds true.
- **The close-out timeout budget starts when a job leaves the queue, not when it is queued.** This is the fact that makes "queue everything green immediately" safe, and it had not been stated in one place before. It now lives in `docs/close-out-pipeline.md`.
- **The driver brief's landing guidance is a code-generated string** (`src/core/driver-brief.ts`), so docs-only tasks cannot put guidance at the driver's next-action surface. If that surface should say "queue all green tasks," it needs a small code task.
- No durable rule for `AGENTS.md` came out of this task: the behaviour was already correct, only undocumented. The new section plus the one-line pointer in `AGENTS.md` are the record.

## Follow-ups

None. The reviewer's suggestion — editing the driver-brief recommendation text in `src/core/driver-brief.ts` so drivers see "queue all green tasks" at their next-action surface — was not filed as a task (`Linked tasks: none recorded`).

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

# Pipeline stage mapping (#1035)

The Work page **Pipeline** view places each task in exactly one stage column.
The mapping lives in `src/core/pipeline-view.ts` (`resolvePipelineCard`) and
is pure: one task plus the live signals the board card already reads, in —
one stage column and step label out. Position is a discrete stage, never a
synthesised progress percentage.

## The mapping

| Stage | Condition |
| --- | --- |
| Coding | `active`, engineer running or idle, no check/handoff in flight |
| Checks | `active` with a self-check running, or queued for a check slot |
| Handoff | `active` with handoff finalization running, or review requested and pending the turn end |
| Review | `review`, reviewer running or awaiting sign-off |
| Close-out | `review` with Move to done queued or running in the integration pipeline |
| Merged | `done` with `releasedAt` (else `updated_at`) inside `PIPELINE_MERGED_WINDOW_MS` (10 minutes) |

A card moves backwards freely: review sending a task back to `active` puts it
in Coding again, with its bounce count on the lane.

## States, not stages

Stuck, needs-input, paused and held never change the column — the card stays
where it stalled:

- **stuck** — the board card's `tc-stuck` evidence (silent agent, stalled
  check, stalled remote validation, telemetry mismatch), a stalled close-out,
  or a failed Move to done. Red chip.
- **needs-input** — `needsInputSurfaces(task)`, the same predicate the board
  card uses. Amber chip with the short reason label.
- **paused** — `active` with no running agent and nothing queued. Dimmed.
- **held** — `isHoldActive`, flag or tag. Keeps its stage, dimmed.
- **merged** — green chip, with an acknowledge action while `needsAck`.

## Ambiguous cases, decided

- **Handoff vs Checks.** Handoff finalization *is* a check run under the
  hood, but the user asked for review — so any handoff signal
  (`pendingHandoff`, or a running `handoff-finalize` check) wins over the
  Checks column. A running `merge-gate` check on an `active` task without a
  handoff signal is Checks.
- **Queued for an agent slot** (`agent.queued`) is not Checks — the gate
  hasn't started. It stays in Coding with a "Queued" step.
- **Queued for a check slot** (local `resourceQueueMarkers`, remote pool
  queue hint) is Checks with a "Queued for checks" step: the gate owns the
  task even though no step is running yet.
- **Checkpoint recovery / delta re-review** (`checkpointRecovery`) stays in
  Review — the task is still the reviewer's, not the gate's.
- **`doneError`** (failed Move to done) stays in its stage with the stuck
  state; the error banner itself lives on the board card and in the drawer.
- **Stale needs-input on a review task** (e.g. a dev-error flag from handoff)
  follows `needsInputSurfaces`, exactly like the board card — no second rule.
- **Time in this state** reads `updated_at` (`releasedAt` once merged).
  That timestamp moves on every server-side transition, so it is the honest
  available signal for "how long here" without a new event stream.
- **Sent back** counts `extra.review_rounds` (auto-bounces) exactly; a task
  back in `active` with completed passes but no bounce counter (manual
  "Review again", older records) counts once. A task still in `review` was
  never sent back by the pass it is showing.

## Lane order

Priority first (`p0` → `p3`, unknown last), then longest in flight first
(oldest `created_at` at the top) so a stale lane is visible without
scrolling, then id for frame-to-frame stability.

## What the card shows

Line 4 (engineer round, reviewer round, models, host) reads the same sources
as the task panel: `extra.review_passes` / `review_rounds` /
`dev_error_count` via `taskRoundCounts` (shared with `TaskDrawer.vue`),
effective agents via `resolveEffectiveAgent`, and the remote run/queue host
(`"this Mac"` when local). No second source of truth.

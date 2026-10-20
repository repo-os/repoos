# Scheduled tasks

RepoOS can create ordinary `work/*.md` tasks on a cadence. Schedule definitions
live as markdown files under `schedules/` (configurable via `schedulesDir` in
`repoos.toml`; a `repoos/` project uses `<namespace>/schedules`). Each file
combines a **task template** (title, body, type, area, priority, assignee,
initial status) with **timing** (one-time, daily, or weekly, plus an IANA
timezone and local time of day).

The files are server-written bookkeeping: a run stamps `last_run_at`,
`last_result`, `last_task_id`, `last_error` and `last_occurrence_key`, often
while an unrelated close-out is in flight. A dirty schedule file on main is
auto-checkpointed at publish time, and a schedule-only advance on main is
treated as non-code drift, so it never blocks or restarts a Move to done (#0860).

The scheduler runs only on the **main control-plane** `repoos serve` instance
when **Scheduled task automation** is enabled in Settings (off by default).
It does not run on preview servers (`REPOOS_PREVIEW_CHILD`), task worktrees,
ephemeral test servers (port `0`), or while `[preview.*]` overrides are
active — so merely serving a branch cannot create tasks.

Derived state (locks under `.repoos/locks/`) is disposable; the schedule files
are the source of truth.

## Catch-up after restart

When the server starts, or on each minute tick, it looks for missed
occurrences per enabled schedule (every due schedule runs once that tick,
sequentially):

- **Daily / weekly:** the latest slot whose local fire time is at or before now,
  and whose **occurrence key** differs from `last_occurrence_key` in the file.
- **One-time:** fires once when `run_at` is in the past and that occurrence has
  not been recorded.

Older missed slots are **not** replayed individually — one catch-up task is
created for the latest due slot, matching the “handle a missed occurrence once”
requirement.

## Duplicate prevention

Before creating a task, the server tries to create an exclusive lock file:

`.repoos/locks/schedule-<id>-<occurrence-key>.lock`

If the lock already exists (another process or a overlapping tick), the run is
skipped. Successful runs persist the occurrence key in the schedule file’s
`last_occurrence_key` field.

## Live updates

Schedule create/update/delete and each run emit SSE events (`schedule.changed`,
`schedule.run`) so the Agents page refreshes without polling.

## Auto-start

`auto_start_agent: true` starts the configured engineer on a generated task when
its initial status is `ready` and the assignee is not `human` — the same
outcome as **Start work** on the board. Assigning a generated task to `ai`
alone does **not** start an agent; only this flag does.

## Manual Run now

When a schedule slot is already due, **Run now** records the same
`last_occurrence_key` as the automatic tick would, so the two paths cannot
create duplicate tasks for one occurrence. Ad-hoc runs when nothing is due use a
`manual:…` key that does not consume a cadence slot.

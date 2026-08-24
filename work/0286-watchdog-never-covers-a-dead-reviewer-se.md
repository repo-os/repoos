---
id: "0286"
title: Watchdog never covers a dead reviewer session — only active tasks are scanned
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T21:14:42Z"
updated_at: "2026-08-24T21:17:04Z"
---
## Problem
`TaskWatchdog.checkNow()` (src/server/task-watchdog.ts) only scans `this.index.getTasks("active")` — it detects and auto-recovers a task stuck in `active` whose engineer session died (no output, no handoff), but it never looks at tasks sitting in `review`. If the *reviewer* agent session dies silently mid-review, there is currently zero automated recovery: the task sits in `review` forever with no report, no error, no watchdog note, and nothing to nudge it — the human has to notice on their own and manually re-trigger a review.

## Confirmed live
Task #0276 ("Auto-handle the self-resolving staleness check in MTD instead of routing through the debugger"): its reviewer session started at 2026-08-24T19:50:34Z, ran for ~1.5 minutes doing real investigation (confirmed by reading `.repoos/reviews/0276.session.json` — 39 transcript lines, last one mid-analysis of a regex in `integration-orchestrator.ts`), then died with no error logged, no `.repoos/reviews/0276.md` ever written, and no "review completed" entry in `.repoos/logs/tasks/0276.log`. The task's `status: review` has sat unchanged since, aside from one unrelated cosmetic `updated_at` bump with no activity-log line (a separate, already-understood no-op write from something else touching the file).

Contrast with #0273, which hit the exact same failure mode (agent exited without emitting the handoff signal) one session earlier — but #0273 was `active` at the time, so the watchdog caught it and auto-surfaced it to a human-visible state ~28 minutes later (`watchdog: auto-surfaced stuck task` in its Activity log). #0276 got no such rescue purely because it happened to already be in `review` when its agent died.

## Root cause
`src/server/task-watchdog.ts`, `checkNow()`:
```ts
async checkNow(): Promise<void> {
  if (this.canRun && !this.canRun()) return;
  for (const task of this.index.getTasks("active")) {
    if (this.isStuck(task)) {
      await this.handleStuck(task);
    }
  }
}
```
Hardcoded to the `active` status only. `isStuck()`'s own logic (no running process, no handoff in flight, not paused, not already surfaced, staleness threshold elapsed) is generic and would apply equally well to a `review`-status task whose reviewer process has died — it just never gets the chance to run.

## Fix directions to investigate
- Extend the scan to also cover `review`-status tasks, but the recovery action can't be identical to the `active` case (which resumes/restarts the ENGINEER). For a dead reviewer, "stuck" recovery should kick off a fresh reviewer run (the same action the human takes manually via "Review again"), not touch engineer state.
- `isStuck()`'s `alreadySurfaced` / staleness-threshold logic should transfer directly; the main change is (a) which statuses get scanned, and (b) `handleStuck()`'s recovery action needs a review-specific branch (or a second, parallel check) since today's `handleStuck` assumes an `active` task and an engineer-side recovery.
- Consider whether this should surface as a visible Activity note (mirroring `watchdog: auto-surfaced stuck task`) even if the fix is "auto-retry the reviewer once" rather than "hand to a human" — silent auto-retry of a review is fine, but it should still leave a trail so a repeated failure doesn't loop invisibly.
- Bound it the same way the `active` path is bounded (surfaced/retried at most once per stuck episode) so a genuinely broken reviewer config doesn't retry forever.

## Acceptance criteria
- A task in `review` whose reviewer agent session dies silently (no report, no completion log entry, no running process) is detected by the watchdog within its normal staleness window, same as a dead engineer session today.
- Recovery either auto-retries the reviewer once (leaving an Activity trail) or surfaces the task to a human-visible/actionable state — does not silently loop.
- No regression to the existing `active`-task watchdog behavior or its bounding (`alreadySurfaced`, handoff-retained checks, etc).
- `repoos check` green.

## Related
- #0273 — the same "agent exited silently, no handoff signal" failure mode, but on the `active` side where the watchdog already covers it.

## Activity

- 2026-08-24T21:14:42Z · created · unknown
- 2026-08-24T21:16:25Z · pm_model_override
- 2026-08-24T21:16:47Z · pm_model_override
- 2026-08-24T21:17:04Z · status inbox→ready

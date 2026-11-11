## TL;DR

Fixed the stale review registration that could block `review again` after its reviewer was gone. The task passed review on pass 5 and merged successfully as `b6eba5edac2ce6fb7236b9fbbd3f74cf898127ba`.

## Outcome

Review registrations are released across failure and cancellation paths, stale registrations without a live reviewer are reaped after the review timeout, and refusal messages include reviewer status and process details when available. Idle reads return before triggering liveness probes. Final verdict: **good to go**.

## Process stats

- Engineering rounds: 4 recorded.
- Review passes: 5; final verdict was good to go.
- Wall-clock from task creation to done: 23h 48m 14s.
- Engineer: haiku, 2 recorded sessions; one process exited with an error. Reviewer: haiku, 5 sessions. Routing: `typesafe/jev-1.14-20261014`, 5 sessions.
- Tokens and cost: engineer, 39,673 tokens and 3.55321207 recorded cost; reviewer, 114,644 tokens and 0.20136382 recorded cost; routing, 16,? tokens and cost not recorded. Exact routing token total: not recorded.
- Final close-out gate completed in 648 seconds.

## What went wrong

- The engineer was restarted by the watchdog after 235 minutes without a live process. Later, an engineer turn exited without requesting handoff, so it was restarted.
- Review passes 1–4 found lifecycle races and missing coverage: cancellation or finalization could leave or incorrectly drop registrations, dead finalizing entries looked live, and idle board reads triggered reconciliation and process probes. These were addressed over subsequent rounds.
- One handoff was deferred because queued messages had not been read; another engineer turn ended without a handoff request. The task ultimately reached review and passed.
- A stale check input caused a rerun. Some checks failed intermittently under parallel load, with different failures across runs; the recorded notes did not establish these as task defects or prove they occurred on main.
- The reported production API outage was not reproduced end to end. The failure path was covered with simulated tests.

## Learnings

- Registration existence and process liveness are separate conditions; cleanup must cover runner entries, completion fences, and registrations, with identity checks to protect newer runs.
- Read-path predicates should return before reconciliation or I/O when no entry exists. Carry this principle into `docs/agent-debugging-and-incidents.md` or the relevant review-runner documentation.
- The reaper’s completion-fence trade-off and the accepted finalizing-entry timestamp behavior should be documented alongside review registration behavior.

## Follow-ups

None recorded. The accepted non-blocking suggestions are preserved in the task record: add a `finalizeRun` rejection test; use the finalizing entry’s `startedAt` for the `since` timestamp; guard late process-close cleanup by entry identity; document the reaper fence trade-off; and prevent a cancelled preparation from emitting `cancelled` after its run is dropped.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

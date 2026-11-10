## TL;DR

The handoff path now waits for a running check to release its lock, with a bounded wait and stale-lock recovery. Final verdict: **good to go**; the accepted review noted follow-up UI and coverage gaps.

## Outcome

Shipped bounded polling for check-gate lock refusals in the handoff path. The wait uses the remaining handoff deadline, recovers stale or dead-holder locks, and records a waiting reason during the wait. Documentation and tests were updated. The change merged as `823e3b6024d6693d7f58ce35f92ab12b3a47df78`.

Final review verdict: **good to go**. The waiting label was not rendered in the captured drawer, but that item was explicitly accepted as a follow-up.

## Process stats

- Engineering rounds: 2. Review passes: 4.
- Created: 2026-11-09T20:11:19Z. Done: 2026-11-10T10:36:08Z. Wall-clock: 14h 24m 49s.
- Engineering: Claude Code / Haiku in the recorded rounds; session records also list Composer 2.5 and Haiku for engineer sessions, including an errored session. Restarts or adoptions: exact total not recorded; the activity log records orphaned engineer PIDs adopted.
- Review: Claude Code / Haiku. Four reviewer sessions; total reviewer tokens and costs are not recorded as an aggregate.
- Recorded reviewer sessions: 68,116 tokens and $0.15256364 combined. Routing sessions: typesafe/jev-1.14-20261014; tokens recorded per session, costs not recorded. Engineer session totals: not recorded.

## What went wrong

- The first engineer session errored because `api2.cursor.sh` could not be resolved. Watchdog surfaced the task, and later sessions resumed work.
- Queued messages were delayed, causing turn endings without handoff requests and repeated nudges. The messages were eventually delivered; handoff was requested again.
- A handoff attempt failed because the engineering report draft was missing. A later check failed on a TypeScript nullability error in `handoff.ts`; the work was revised.
- A check wait exceeded the handoff deadline while queued behind another task’s local check, and a later run timed out waiting for the local check slot. The wait budget was then tied to the handoff deadline.
- Review found the waiting label was masked or not wired to the rendered drawer line. The final accepted scope deferred this UI label, related label-path tests, and some other server git paths that remain fail-fast.
- Close-out completed successfully in 787 seconds.

## Learnings

- Bound nested waits by the enclosing operation’s deadline to avoid orphaned work. This belongs in `docs/check-run-history.md` and `user-docs/check.md`.
- Retry only when the refusal specifically means a check is running; unrelated git failures should remain immediate.
- Tie asynchronous status updates to the attempt that created them so an older attempt cannot overwrite newer state.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

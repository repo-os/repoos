## TL;DR

Shipped bounded automatic recovery for failed review runs and overdue queued engineer messages, with settings, activity logging, safety exclusions, tests, and documentation. Final review verdict: **good to go**.

## Outcome

Review runs that fail without a usable report now retry up to the configured limit, then surface a specific `needs_input` reason. Overdue queued engineer messages can restart an engineer on the same worktree when no engineer is live. Both paths respect held, paused, and human-assigned tasks; queued-message recovery also respects the pressure guard.

The first review found that failed-report retries shared a counter with timeout retries. The fix gives them separate persisted counters. The change was merged as `92c40cb797353a0db45b8bac0daa8cb11435f9f4`.

## Process stats

- Engineering rounds: 2. Review passes: 2.
- Task duration: 4 hours, 28 minutes, 29 seconds, from creation to done.
- Engineer: 1 recorded session, `gpt-6-luna`; 63,445,607 tokens; cost not recorded. An initial turn ended without handoff, and an orphaned engineer process was later adopted.
- Reviewer: 2 sessions, `composer-2.5`; tokens and cost not recorded.
- Routing sessions: 2, `typesafe/jev-1.14-20261014`; 6,458 tokens total; cost not recorded.
- Final verdict: good to go. Close-out gate completed in 288 seconds.

## What went wrong

- The first engineer turn ended cleanly without implementation or a handoff. Work resumed after a queued message and adoption of an orphaned engineer process.
- The first handoff failed on a remote host lock test. It passed in isolation locally, so the test was changed to use a release marker instead of a fixed sleep. The final check passed.
- Review pass 1 found the shared retry-counter bug. Separate persisted counters and tests for both retry orderings resolved it; review pass 2 found no bugs.
- Local full-suite attempts had load-sensitive timeouts while the pressure guard reported high load. Remote validation was used; the final check passed.

## Learnings

Retry policies with separate limits and reset conditions need independent durable counters. Retry timers should recheck whether a task is still eligible when they fire. Lock tests should synchronize on the event under test rather than rely on fixed sleeps.

These durable practices belong in the review and test guidance in `docs/agent-workflow-rules.md` or the relevant debugging documentation.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

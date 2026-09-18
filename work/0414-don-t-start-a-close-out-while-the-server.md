---
id: "0414"
title: Don't start a close-out while the server is mid-reload
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/don-t-start-a-close-out-while-the-server
created_at: "2026-09-18T14:06:27Z"
updated_at: "2026-09-18T17:02:19Z"
review_passes: 1
skill_suggestion: "0418"
handoff_signal_retry_count: 1
---
## Problem

#0412's Move to done failed at 2026-09-18T14:04:22Z with `validation failed (non-retryable)` / `auto-resolve failed for work/0412-….md`. The code was fine. Timeline from `.repoos/logs/system.log` and `.repoos/logs/tasks/0412.log`:

- 14:04:21.475: #0413's close-out rebuilt main, and the server began a reload (`reload: spawning replacement … (build changed (poll))`).
- 14:04:21.56: #0412's close-out job started on the OLD server, 90 ms later.
- 14:04:22.40: `mergeBranch` (`src/core/git.ts`) auto-resolved the task file (`checkout --theirs` + `add`), then `git commit --no-edit` failed. The most likely cause is git lock contention with the booting replacement.
- 14:04:24.69: the old server handed over and exited mid close-out.

The same merge and resolution succeed when run by hand, and a retry works.

`src/server/reload.ts` says a reload already in flight when a close-out begins is aborted at handover. Here the handover proceeded anyway.

## Acceptance criteria

- [ ] A close-out can't begin while a reload replacement is spawning or handing over: either wait for the reload to settle or abort the reload first, and cover that ordering with a test.
- [ ] `mergeBranch`'s auto-resolve path records git's actual stderr when the resolution commit fails (today it's a generic `auto-resolve failed`).
- [ ] A lock-contention failure (`index.lock` / `Unable to create … .lock`) is classified retryable, not `non-retryable`.

## Activity

- 2026-09-18T14:06:27Z · created · unknown
- 2026-09-18T14:11:48Z · note: Root cause of no auto-retry: validateCandidate (src/server/integration-orchestrator.ts ~984) marks EVERY failed mergeBranch as retryable:false ('a conflict is a property of the two trees'). That's wrong when merge.conflicts is empty, i.e. auto-resolve succeeded but its commit failed. Only real conflicts should be non-retryable. Also, the self-heal repair handoff (~654) only fires for reasons starting 'merge conflict in ', so 'auto-resolve failed …' got neither a retry nor a repair and the job just failed.
- 2026-09-18T14:57:49Z · status inbox→ready
- 2026-09-18T14:57:51Z · status ready→active, branch
- 2026-09-18T15:13:29Z · status active→review
- 2026-09-18T17:02:19Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review

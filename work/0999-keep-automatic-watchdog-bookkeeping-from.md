---
id: "0999"
title: Keep automatic watchdog bookkeeping from blocking close-out
type: bug
status: active
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/keep-automatic-watchdog-bookkeeping-from
created_at: "2026-11-01T11:58:54Z"
updated_at: "2026-11-02T02:00:49Z"
---
## Problem
Automatic watchdog bookkeeping in a tracked task file can dirty main while another task is trying to close out. On 2026-11-01, #0994 accumulated automatic check-wait escalation/recovery activity entries on main. The main-clean guard then blocked #0994 and #0998 even though these entries were RepoOS-generated status records, not source edits.

## Desired behavior
Durable task status and activity remain available, while narrowly identified machine-generated bookkeeping does not strand unrelated close-outs. Human-authored task edits, source changes, unknown metadata, and invalid task files must keep blocking with a precise explanation. No broad exemption for task files, no silent staging of unrelated paths, and no publication of a candidate different from the validated tree.

## Acceptance criteria
- Reproduce automatic watchdog activity updates on main while another task is ready to land; close-out remains safe without a manual commit for only those recognized generated entries.
- Human edits to task body/frontmatter, mixed generated and human changes, unrelated source WIP, unknown task metadata, and parse failures remain protected and report the exact blocking paths.
- Concurrent task activity and close-out cannot lose updates, stage unrelated files, alter the validated source tree, or publish an unvalidated candidate.
- CLI landability and the actual Move to done pipeline agree; add regression tests and update directly affected close-out/watchdog documentation.

## Notes for AI
Inspect #0693 and #0682, `src/core/landable.ts`, the watchdog/task metadata writers, and close-out staging/publication code. Keep the fix narrow, preserve RepoOS task state as source of truth, and do not commit or auto-checkpoint arbitrary human settings.

## Activity

- 2026-11-01T11:58:54Z · created · njachowski@gmail.com
- 2026-11-01T11:59:12Z · body: Problem (added 1, removed 11); Desired behavior (added 1, removed 1); Notes for AI (added 1, removed 1)
- 2026-11-01T17:04:48Z · status inbox→ready
- 2026-11-02T01:48:49Z · status ready→active, branch
- 2026-11-02T01:57:19Z · message_queued at 2026-11-02T01:57:19.107Z
- 2026-11-02T01:57:19Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T02:00:49Z · CTO nudge: held — an undelivered message is already queued

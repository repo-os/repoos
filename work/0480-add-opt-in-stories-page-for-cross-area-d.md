---
id: "0480"
title: Add opt-in Stories page for cross-area delivery tracking
type: feature
status: active
needs_input: true
needs_input_reason: watchdog-stuck
priority: p2
area: web + core
assigned_to: ai
created_by: ""
branch: feat/add-opt-in-stories-page-for-cross-area-d
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-21T12:19:02Z"
updated_at: "2026-09-21T15:44:21Z"
check_retry_count: 2
last_check_failure: "[object Object]"
dev_error_count: 3
---
## Problem

Tasks can share a customer-visible outcome while belonging to different technical areas and owners. For example, the RepoOS project-updates email list spans Neon infrastructure, the landing site, and a human-operated launch checklist. Areas describe where work lands; they cannot show whether the whole outcome is ready.

## Desired UX

When Stories is explicitly enabled for a repository, a new Stories page appears in the primary navigation between Work and Checks. It groups tagged tasks into named delivery slices and makes their collective state legible at a glance. A story is optional task metadata, not a second task system: it has no worktree, agent, branch, independent status, or hierarchy.

## Configuration and data model

- Add a documented `[stories]` configuration block with `enabled = false` by default. Missing, malformed, or false configuration must preserve current behavior exactly.
- Add an optional `story` field to task frontmatter, the task model/index, task API serialization and task mutation paths. Normalize whitespace and match story names case-insensitively for grouping while retaining a stable display name.
- Support setting, changing, and clearing a story through the existing task create/edit APIs and CLI. In the task drawer, use the standard styled control: offer existing story names and permit a deliberate new name; do not use a native select.

## Stories page

- [ ] Add a `/stories` route and show its navigation item only when `stories.enabled` is true, placed exactly between Work and Checks.
- [ ] Group every tagged task by story; untagged tasks do not appear. Do not create separate story files or a parallel persistence store.
- [ ] Each story card shows: title, total task count, done/total progress, per-status counts, currently active/review tasks, tasks awaiting human input or blocked/error states when available, and most recent activity.
- [ ] Order stories with attention-needed/active work first, then by recent activity; completed stories remain visible but visually quiet.
- [ ] Expanding or opening a story reveals its member tasks with the same status cues and opens the normal task drawer on selection. Include useful empty states for no tagged tasks and no stories.
- [ ] A story is derived as complete only when all of its tasks are done. Do not add a manual completion control.

## Compatibility and verification

- [ ] With Stories disabled, there is no nav item, route entry point, task-edit control, extra API work, or visual regression in existing boards.
- [ ] Existing task files without `story` parse unchanged; unknown/legacy frontmatter remains preserved.
- [ ] SSE/index updates immediately refresh story roll-ups when a task is retagged or changes status.
- [ ] Add parser/config/API/unit tests plus UI tests for the disabled gate, nav position, grouping, status roll-up, ordering, retagging, and mobile layout. Run `repoos check`.
- [ ] Document Stories configuration and the distinction between a story and an area in user documentation.

## Non-goals

No nested stories/epics, standalone story tickets, story-specific agents or worktrees, manual story statuses, cross-repository aggregation, or campaign/project-management features. This is a deliberately small, derived planning layer over existing tasks.

## Seed example

After implementation, the project-updates email-list tasks (#0477, #0478, #0479) should be taggable as one story, demonstrating a cross-area outcome without changing their individual areas.

## Activity

- 2026-09-21T12:19:02Z · created · unknown
- 2026-09-21T12:22:42Z · status inbox→ready
- 2026-09-21T12:22:46Z · status ready→active, branch
- 2026-09-21T12:23:37Z · agent exited with an error (copilot) · • If the problem persists, retry later or contact support with the Request ID above
- 2026-09-21T12:33:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-21T13:14:57Z · needs_input
- 2026-09-21T13:16:55Z · agent exited with an error (copilot) · • If the problem persists, retry later or contact support with the Request ID above
- 2026-09-21T13:18:15Z · cli_override
- 2026-09-21T13:18:18Z · model_override
- 2026-09-21T13:18:21Z · needs_input
- 2026-09-21T14:21:55Z · handoff failed · check failed after 2 automatic retries · repoos check failed: Automatic merge went well; stopped before committing as requested · Switched to a new branch 'feat/current' · Switched to a new branch 'feat/current' · Preparing worktree (new branch 'other/thing') · ❯ tests/mtd-docs-fast-path.test.ts (13 tests | 1 failed) 1854ms · × runs a declared bootstrap check without inventing a build step 326ms · Switched to a new branch 'other' · Switched to a new branch 'hotfix/0999-already'
- 2026-09-21T14:27:05Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-21T14:35:35Z · handoff failed · check failed after 2 automatic retries · repoos check failed: [global-reap] removed 52 stale repoos-* fixture dirs from the tmpdir — a test is likely leaking. Check which prefix dominates (`ls "$TMPDIR" | grep '^repoos-' | sed 's/-[A-Za-z0-9]\{6\}.*//' | sort | uniq -c | sort -rn`). · ❯ tests/mtd-docs-fast-path.test.ts (13 tests | 1 failed) 1329ms · × runs a declared bootstrap check without inventing a build step 306ms · ❯ tests/task-watchdog.test.ts (35 tests | 1 failed) 22235ms · × does not touch a task with a running agent or a fresh activity entry 2755ms · Switched to a new branch 'feat/current' · Switched to a new branch 'feat/current' · Automatic merge went well; stopped before committing as requested
- 2026-09-21T14:44:25Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · repoos check failed: Automatic merge went well; stopped before committing as requested · Switched to a new branch 'feat/current' · Switched to a new branch 'feat/current' · Preparing worktree (new branch 'other/thing') · ❯ tests/mtd-docs-fast-path.test.ts (13 tests | 1 failed) 1854ms · × runs a declared bootstrap check without inventing a build step 326ms · Switched to a new branch 'other' · Switched to a new branch 'hotfix/0999-already' · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-09-21T15:44:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity

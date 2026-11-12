---
id: "1077"
title: "Check-window drift: catch source changes that are committed then reverted during a check (follow-up to #1061)"
type: bug
status: review
priority: p3
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/check-window-drift-catch-source-changes-
created_at: "2026-11-09T09:04:34Z"
updated_at: "2026-11-12T01:09:01Z"
---
## Problem
#1061 detects source changes that exist when a check ends (net tree delta vs the check-start tree) and defers RepoOS bookkeeping commits while a check runs. Two gaps were accepted when #1061 landed: (1) a source commit followed by a revert inside the same check window leaves an empty endpoint diff, so a check that observed the intermediate source is treated as valid; (2) an already-running engineer can still write source files directly during a check (not blockable; only detectable).

## Desired UX
A check result is never reported as valid if the source tree it ran on changed, even transiently, while it ran; the handoff says which commit/path and why in plain English.

## Acceptance criteria
1. Detect transient source changes: record the set of commits (or ref/reflog movements) that touched non-bookkeeping paths during the check window and invalidate the check when any exists, even when the final diff is empty; merges are classified by what they bring in, bookkeeping-only merges stay accepted (including a merge whose second parent is the check-start commit).
2. Fail closed: an established source delta that cannot be matched to a listed commit invalidates the check.
3. Optional: a cheap tripwire for direct filesystem writes (mtime/hash snapshot of tracked source files before and after the check) so gap (2) is at least detected, with a clear message; document that it cannot be blocked.
4. Tests for each case, via production call sites (handoff, self-check, close-out); docs updated.

## Notes for AI
Start from the merged #1061 code (`src/core/check-gate-bookkeeping.ts`, `src/server/check-gate-lock.ts`, `src/server/handoff.ts`, `src/commands/check.ts`) and its review reports under work/reports/1061/ (reviews 4-13). Do not edit repoos.toml.

## Activity

- 2026-11-09T09:04:34Z · created · njachowski@gmail.com
- 2026-11-12T00:14:57Z · status inbox→ready
- 2026-11-12T00:15:01Z · status ready→active, branch
- 2026-11-12T00:15:27Z · message_queued at 2026-11-12T00:15:27.446Z
- 2026-11-12T00:18:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T00:22:18Z · body
- 2026-11-12T00:30:46Z · body
- 2026-11-12T00:34:00Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-12T00:34:01Z · message_queued at 2026-11-12T00:34:01.008Z
- 2026-11-12T00:34:01Z · ↻ resuming engineer to read queued message
- 2026-11-12T00:34:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Fixing the handoff test: `headBeforeCheck` was captured before the handoff commit, so the comparison was invalid. · stderr: (empty)
- 2026-11-12T00:34:02Z · message_delivered: 2 message(s)
- 2026-11-12T00:43:22Z · message_queued at 2026-11-12T00:43:22.604Z
- 2026-11-12T00:43:22Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-12T00:48:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T00:55:31Z · body
- 2026-11-12T01:03:22Z · CTO nudge: held — handoff gate is running
- 2026-11-12T01:09:01Z · status active→review

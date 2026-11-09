---
id: "1077"
title: "Check-window drift: catch source changes that are committed then reverted during a check (follow-up to #1061)"
type: bug
status: inbox
priority: p3
area: [core, server]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T09:04:34Z"
updated_at: "2026-11-09T09:04:34Z"
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

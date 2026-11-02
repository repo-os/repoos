---
id: 1008
title: Review and safely clean task worktrees
type: chore
status: ready
priority: p2
area: [core, server]
assigned_to: ai
created_by: schedule
branch: ""
created_at: "2026-11-01T22:00:49Z"
updated_at: "2026-11-01T22:00:49Z"
---
## Purpose

Each morning, review registered Git worktrees and reclaim only worktrees RepoOS proves safe to remove. Report protected worktrees with their exact reasons so unfinished or user-owned work is never lost.

## Runbook

1. Re-read `AGENTS.md`, `repoos driver brief`, and `repoos list`. Check the live state of any task referenced by a retained worktree.
2. Run `repoos status --json` and `repoos gc --dry-run`. Record the current count, safe candidates, and protected reasons.
3. If RepoOS reports safe candidates, apply its own guarded cleanup with `repoos gc --yes`, then verify with another `repoos status --json` and `repoos gc --dry-run`.
4. Never remove a worktree or branch by hand. Never clean active, review, held, human-assigned, dirty, or unmerged task work. Do not reset task files to main based only on their path. Leave unresolved done/archived worktrees for the safety rules tracked in #1004.
5. Record before/after counts and the protected worktrees in this task's handoff report. If there are no safe candidates, report that and finish without changing anything.

Do not edit product code, push, or start unrelated tasks as part of this scheduled run.

## Activity

- 2026-11-01T22:00:49Z · created · schedule

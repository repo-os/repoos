---
id: "1124"
title: "Worktree cleanup: decide and build the safe handling for 'unsafe' (protected) task worktrees"
type: feature
status: inbox
priority: p3
area: [core, server]
assigned_to: ""
created_by: t@t
branch: ""
created_at: "2026-11-15T00:41:58Z"
updated_at: "2026-11-15T00:41:58Z"
---
## Problem

`repoos gc` only removes worktrees RepoOS proves safe (task merged and done, clean tree). The safe case will be handled by a simple scheduled job (see #1055, which is on hold). That leaves the 'unsafe' worktrees: ones `repoos gc --dry-run` protects because the task is active, in review, held, human-assigned, has a dirty tree, or has an unmerged branch (including done/archived tasks whose branch never merged). Today they pile up forever and nobody decides what to do with them.

We have not decided how to handle these. This task is to decide that, then build only the non-destructive parts.

## Acceptance criteria

- [ ] A short design note in docs/ lists every protected-worktree class that `repoos gc --dry-run` reports on this repo (with counts and examples), and for each class states the recommended action: keep, ask the human, archive then remove, or fix the underlying bug.
- [ ] `repoos gc --dry-run` (or a new read-only `repoos gc --report`) lists each protected worktree with its class, age, last commit date, whether the branch is merged, and the recommended action, in plain text and JSON.
- [ ] The Worktrees view (or the existing place protected worktrees are shown) shows the same class and recommended action, so a human can triage without the CLI.
- [ ] Any removal of an unsafe worktree requires explicit per-worktree human confirmation, and RepoOS first preserves the work (for example a git bundle or an archive tag of the branch tip plus a record of the dirty diff) so nothing is lost. A test proves a dirty or unmerged worktree is never removed without that confirmation and that the preserved copy can be restored.
- [ ] No unsafe worktree or branch is removed by this task itself, and no scheduled job ever removes an unsafe one. Safe-case cleanup (#1055) is untouched.

## Notes for AI

Read #1055 and src for `repoos gc` first. Do not widen what gc auto-removes. Design the classes from the real dry-run output, not guesses. Keep zero runtime dependencies. If a class is better solved by fixing why the worktree was left behind (for example a close-out that fails to clean up), file that as its own task instead of working around it here.

## Activity

- 2026-11-15T00:41:58Z · created · t@t

---
id: "0600"
title: Worktree handoff guard false-positives on RepoOS task-file bookkeeping commits
type: bug
status: inbox
priority: high
area: core
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-09-30T10:24:58Z"
updated_at: "2026-09-30T10:25:44Z"
---
## Problem

The #0598 worktree-handoff guard (src/server/worktree-handoff-guard.ts) refuses Move to done when the feature worktree's HEAD differs from the handoff-recorded sha. But RepoOS itself commits task-file metadata updates (`docs(<id>): update task`, via patchTaskFile/commitTaskFile) onto the task branch after handoff, so HEAD moves without any real post-handoff edit.

Observed 2026-09-30 on #0599: handoff recorded a97d39dc; HEAD was 829094fc. `git diff a97d39dc HEAD` touched only work/0598-*.md and work/0599-*.md (10 lines). Move to done was blocked with 'worktree changed after handoff' until a human reset the branch by hand.

## Expected

Commits after handoff that touch only `work/*.md` task files (RepoOS bookkeeping) must not trip the guard, and must not require a manual reset or sending the task back to active. Real edits to any other path must still be caught (dirty tree or moved HEAD).

## Suggested approach

- In the guard, when HEAD != recorded sha, diff recorded..HEAD; if every changed path is under work/ and is a task .md file, treat as unchanged. Alternatively update the recorded snapshot sha when RepoOS makes the bookkeeping commit itself.
- Also investigate why a bookkeeping commit for a different task (#0598) landed on #0599's branch.
- Add tests to worktree-handoff-guard.test.ts and done-guard.test.ts: task-file-only drift passes; mixed drift (task file + source) still fails.
- Update docs/close-out-pipeline.md and the AGENTS.md interactive-session section if the rule wording changes.

Incident: 2026-09-30, #0599 after #0598 landed.

## Activity

- 2026-09-30T10:24:58Z · created · unknown
- 2026-09-30T10:25:41Z · cli_override, model_override
- 2026-09-30T10:25:44Z · model_override

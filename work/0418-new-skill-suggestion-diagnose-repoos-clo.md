---
id: "0418"
title: "New Skill Suggestion: Diagnose RepoOS close-out validation failures"
type: spec
status: inbox
priority: p2
area: server
assigned_to: human
created_by: ""
branch: ""
created_at: "2026-09-18T15:13:54Z"
updated_at: "2026-09-18T15:13:54Z"
---
## Problem

Task #0414 (Don't start a close-out while the server is mid-reload) completed a session that appears to contain a
non-trivial, reusable procedure: **Diagnose RepoOS close-out validation failures**.

This is an auto-generated suggestion from that session. Nothing is live as a
skill yet — approve it by turning the draft below into a skill file.

## Desired UX

If the draft is worth keeping, create `skills/diagnose-repoos-close-out-validation-failures/SKILL.md` from it (edit
as needed) and close this task the normal way. If it is not, close it and
discard the draft.

## Draft skill (SKILL.md)

```markdown
---
name: diagnose-repoos-close-out-validation-failures
description: Use when a Move-to-done / close-out fails with 'validation failed (non-retryable)' or 'auto-resolve failed', to find whether it was a real conflict, a reload race, or a misclassified retryable git error.
---

# Diagnose RepoOS close-out validation failures

## When to use

A task's close-out (`POST /api/tasks/:id/done`) fails with `validation failed (non-retryable)`, `auto-resolve failed for work/<id>.md`, or a lock-contention error. The code looks fine, a manual retry works, or the same merge succeeds by hand. This covers the close-out pipeline in `src/server/integration-orchestrator.ts` and `src/core/git.ts`.

## Procedure

1. **Build the event timeline.** Read `.repoos/logs/system.log` and `.repoos/logs/tasks/<id>.log` for the failing job. Note the exact timestamps of: the close-out job start, any `reload: spawning replacement` / `build changed (poll)` lines, `mergeBranch` calls, and the old server handover/exit. Determine whether a server reload replacement was spawning or handing over *during* the close-out window.
2. **Check for a reload race.** If a reload was in flight when close-out began, the failure is environmental, not a code bug: a close-out must not start while a replacement is spawning/handing over. The fix is ordering — wait for the reload to settle or abort it first — not changing merge logic.
3. **Inspect retryable classification in `validateCandidate`** (in `src/server/integration-orchestrator.ts`, ~line 984). Confirm it does NOT mark *every* failed `mergeBranch` as `retryable:false`. Only a real conflict — `merge.conflicts` non-empty — should be non-retryable. When auto-resolve already succeeded but its commit failed, `merge.conflicts` is empty and the error must be retryable.
4. **Check the self-heal repair handoff** (~line 654 in the same file). Confirm it fires for the actual failure reason string. If it only matches reasons starting `merge conflict in `, an `auto-resolve failed …` reason gets neither a retry nor a repair and the job dies silently.
5. **Inspect `mergeBranch` in `src/core/git.ts`** auto-resolve path. Confirm that when `git commit --no-edit` fails after `checkout --theirs` + `add`, the error records git's *actual stderr* (today it is a generic `auto-resolve failed`). Also confirm lock-contention signals — `index.lock` or `Unable to create … .lock` — are classified **retryable**, not `non-retryable`.
6. **Add a test** covering the ordering guarantee (close-out cannot begin during a reload) and, if changed, the retryable classification of lock-contention / empty-conflict failures.
7. **Verify by hand.** Run the merge/resolve steps manually outside the server to confirm the underlying git operation succeeds — this isolates environmental (reload/lock) causes from logic causes.
```

## Activity

- 2026-09-18T15:13:54Z · created · unknown

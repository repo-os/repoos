---
task: "1061"
pass: 16
at: "2026-11-09T12:34:23.228Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "8a1f63217:a434d494b"
---
Repeated review classes: The pass-15 drift-detection and crash-recovery findings are fixed in this tree. The recurring pattern is fail-closed and protection logic that breaks on tree shapes the snapshot never models, such as submodules and symlinks. That pattern has recurred across passes, so a human should look at it.

## Verdict
needs some work — Gated checks fail in repos with submodules, and protection can chmod files outside the worktree.

## Relevance
still relevant — Bookkeeping commits still invalidate running checks on main, so the fix is worth landing.

## Evidence
None

## Bugs
- **Snapshot fails closed on legitimate tree shapes:** `trackedSourceSnapshot` in `src/commands/check.ts:1951` returns `null` on any non-ENOENT read error. A checked-out submodule (gitlink) or a tracked symlink to a directory makes `readFileSync` throw `EISDIR`, so `trackedSourceSnapshotDrift` refuses every gated run with "Could not compare tracked source files…". I reproduced the `EISDIR` on a gitlink directory. This hits `repoos check` on any task branch in a repo with submodules. RepoOS itself has none, so the suite does not catch it.
- **Protection follows symlinks outside the worktree:** `trackedSourceFileModes` and `applyTrackedSourceProtection` in `src/server/check-gate-lock.ts:315-345` use `statSync` and `chmodSync`, both of which follow links. In a probe, a tracked link to a file outside the repo had that file's mode changed to 444 during the lock. Restore happens only on release. Use `lstatSync` and protect only regular files.
- **Handoff snapshot collapses unreadable files to equal:** `worktreeState` in `src/server/handoff.ts:482` records `"<unreadable>"` for any read failure, so two failed reads compare equal. Round 14 rejected exactly this design for the check path. A dirty submodule or unreadable source edit can pass undetected. Return an unavailable state so the gate fails closed.

Class: non-regular or unreadable tracked entries. I grepped the three snapshot and protection sites above; no other sibling in the diff uses this pattern.

## Edge cases
- `git merge-tree` against main conflicts only in `work/1061-checks-stop-repoos-bookkeeping-commits-f.md`, the task's own file. Close-out takes main's copy. No source file conflicts.
- The one handoff capture is stale and matched `src/ui-app/**`, but the diff touches only `src/ui-app/tests/**`. No UI behavior changed, so it is not a blocker.

## Suggestions
- Add tests for a gitlink directory and a tracked symlink to an outside file, covering both the snapshot and lock protection.
- The snapshot reads every tracked file synchronously twice per gated check. On a large repo that blocks the event loop; consider async reads.
- The two accepted limitations (a) and (b) are stated in `docs/check-run-history.md` and `user-docs/check.md`.

## Verdict
needs some work — Gated checks fail in repos with submodules, and protection can chmod files outside the worktree.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


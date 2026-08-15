---
id: "0211"
title: "Dirty-main guard did not fire on move-to-done, merge failed instead"
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/dirty-main-guard-did-not-fire-on-move-to
model_override: default
created_at: "2026-08-15T05:40:46Z"
updated_at: "2026-08-15T06:30:50Z"
---
## Problem

#0204 shipped a dirty-main guard: clicking "Move to done" is supposed to check `main` for uncommitted files and, if any exist, return 409 with `needsCommit` + the file list so the UI shows a modal offering "Commit & continue" / "Cancel". It did not fire on the #0205 close-out. The job was enqueued against a dirty tree, ran the full validation gate, and then failed at the publish step with:

```
could not merge to main: error: Your local changes to the following files would be overwritten by merge:
	dist/.build-info.json
	dist/ui/index.html
	dist/ui/sw.js
Please commit your changes or stash them before you merge.
Aborting
```

This is exactly the failure #0204 was written to prevent. The user saw no modal and no explanation — the task silently stayed in `review`.

## Evidence gathered

- The guard is present in source: `src/server/routes/tasks.ts` (~line 437) calls `dirtyFiles(config.root)` before `jobCoordinator.enqueue`, returning 409 + `needsCommit` + `dirtyFiles` when dirty and `commitDirty` is not set.
- The client half is present: `completeTask` in `src/ui-app/src/stores/repo.ts` (~line 788) maps the 409 onto `DirtyMainError` and populates `dirtyMain`, which drives the modal in `TaskDrawer.vue` / `TaskCard.vue`.
- The guard is in the COMPILED build the running server loaded: `dist/server/routes/tasks.js` contains `needsCommit`, built 2026-08-15T04:59:28Z; the live server (port 7171, root `/Users/nick/code/nick/repoos`) reports that same `buildAt`.
- `dirtyFiles()` works correctly against this repo: returns 16 files in 27ms when probed directly.
- The working tree was definitely dirty at enqueue time (2026-08-15T05:26:24Z): uncommitted `dist/` artifacts plus several source and work files.
- No `chore: checkpoint before close-out (#0205)` commit exists, so the "Commit & continue" path was not taken either.
- PATCH `/api/tasks/:id` with `status: done` is not a bypass — it 400s and redirects to POST `/done`.

So: guard present, guard functional in isolation, tree dirty, yet the request reached `enqueue` with no 409.

## Acceptance criteria

- [ ] Root cause identified for why `dirtyFiles()` returned empty (or the guard was skipped) on this request path
- [ ] `dirtyFiles()` no longer fails open: a git error or timeout must be distinguishable from a clean tree, and must not silently allow the close-out to proceed
- [ ] The publish step surfaces a merge failure caused by a dirty main as an actionable UI error, not a raw git message
- [ ] Regression test: a close-out attempted against a dirty main returns 409 + `needsCommit` and never enqueues an integration job
- [ ] Regression test: a close-out where the dirty check itself errors or times out fails closed rather than enqueueing

## Notes for AI

- `dirtyFiles()` in `src/core/git.ts` (~line 620) returns `[]` on ANY failure: `if (out.status !== 0 || !out.stdout || out.stdout.trim() === "") return []`. A non-zero exit or a 4s timeout is therefore indistinguishable from a clean tree — this fail-open is the prime suspect and is worth fixing regardless of whether it was the trigger here.
- The 4000ms timeout on `git status --porcelain` is tight for a repo with ~30 live worktrees under heavy CPU load; the machine was running a full test suite and several builds concurrently at the time of this failure.
- Consider having the publish step re-check for a dirty tree immediately before merging, since the tree can be dirtied between enqueue and publish (validation takes minutes).
- #0204's acceptance criteria are all still unchecked in `work/0204-show-dirty-main-files-on-move-to-done-an.md`, and it reached `review` via the watchdog after its agent exited without a handoff signal — the guard may never have been exercised end-to-end.

## Related

- #0204 (shipped the guard)
- #0205 (the close-out that hit this)

## Activity

- 2026-08-15T05:40:46Z · created · unknown
- 2026-08-15T05:45:58Z · status inbox→ready
- 2026-08-15T05:46:00Z · status ready→active, branch
- 2026-08-15T06:07:24Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T06:30:50Z · model_override

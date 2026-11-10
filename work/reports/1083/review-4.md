---
task: "1083"
pass: 4
at: "2026-11-10T21:58:15.163Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/review-runner-a-stale-review-already-run
state: ok
tree_identity: "922a09f08:"
---
## Verdict
needs some work — `registration()` still runs the reconciling liveness probe on every board read, so the pass-3 fix did not land.

## Relevance
still relevant — `review.ts` still has the leak and no landed change removes the need for the registration reaper.

## Evidence
None. No UI shots apply to this diff.

## Bugs
1. **Side-effectful liveness probe still runs on read paths.** `ReviewManager.registration()` (`src/server/review.ts:1308`) calls `this.runner?.isRunning(key)` before its early return. `AgentRunner.isRunning` (`src/server/agents.ts:6420`) calls `reconcileDeadAgents()`, which reads the registry, probes pids, and lists process groups for every entry, and can reap other tasks' entries. The early return only skips `reviewProcessLive`, so the probe still runs for every idle task on every `isRunning`, `runningCount` and `reapStaleRegistration` call. Callers include `routes/info.ts:156` (board GET, per task), `task-watchdog.ts`, and `request-close-out.ts`. The test at `src/ui-app/tests/review-stale-registration.test.ts:92` stubs `reviewProcessLive`, so it cannot catch this, and the engineering report's claim that "board reads do no registry or pid work for idle tasks" is false. Fix: check `this.runs` and `this.completions` first, and add a non-reconciling presence check on the runner (`entries.has`). Reconcile only once something is present. Test it by spying on `readRegistry` or `reconcileDeadAgents`.
   - Class: **reconciling predicate on a read path.** Other instances: `review.ts:2566` (`cancel`) and `review.ts:2654` are action paths, so they are acceptable as they are.

Pass-2 bug 1 (finalizing entry treated as live) and pass-3 bug 2 (no prepare-rejects test) are verified fixed: `reviewProcessLive` excludes finalizing entries, and the prepare-rejects test is at line 81. Earlier fence and unguarded `runs.delete` findings are also fixed; every remaining `runs.delete` and `completions.delete` site is identity-guarded or runs in the same synchronous reaper tick.

## Edge cases
- `reconcileDeadAgents` now reaps adopted review turns (`agents.ts:6470`). Because `reviewProcessLive` calls it, a board GET can now finalize a dead adopted review's report. This is covered by `review-dead-adopted.test.ts`, but it is a read-path side effect and belongs with bug 1.
- The reaper's `since` for a finalizing entry with no fence or run falls back to `Date.now()`, so that entry never ages out. This is accepted follow-up (2).
- `merge-tree` conflicts only in the task's own `work/1083-*.md`, which the landing checklist already covers. No source file conflicts.
- No bare `node`, `npm` or `npx` invocations were added. The grep hits are `node:fs` imports.

## Suggestions
Accepted, non-blocking follow-ups from the task body:
1. A `finalizeRun` rejection test.
2. A stamped `since` for a finalizing entry, falling back to the entry `startedAt`.
3. An entry-identity guard on the late proc `close` handler.
4. Documenting the reaper fence trade-off.
5. A cancelled preparation emitting `cancelled` after its run has been dropped.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


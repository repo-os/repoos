---
task: "1061"
pass: 4
at: "2026-11-08T20:02:02.650Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "127294762:a434d494b"
---
## Relevance
still relevant — Nearby check work does not address bookkeeping commits during a running gate.

## Evidence
None

## Bugs
- **Lifecycle wiring:** `acquireCheckGateLock` has no production callers. Handoff, engineer self-check and close-out therefore never acquire or release the lock, so bookkeeping is not deferred and the gate protections never activate. `commitFiles` also defaults the lookup root to the commit worktree rather than the server’s board root, so its hook would miss a board-root lock when no override is set.
- **Drift detection and reporting:** `src/server/handoff.ts:473` still uses the old own-task-file exception; `checkGateHeadDriftAllowed` has no production caller. A `work/reports/**` commit still invalidates handoff, and source-change refusals omit the commit subject and paths. The new tests exercise the unused helper rather than the handoff path.
- **Source-write protection:** `writeWorktreeSourceFile` has no production callers. An already-running engineer can still write source directly, even if a lock is acquired; the agent-start refusal and Git wrappers do not fence filesystem writes.
- **Queue durability and concurrency:** `src/server/check-gate-lock.ts:440` represents both an empty file and a deletion as `""`, then deletes either during flush. Flush also overwrites current files with snapshots, potentially discarding later unqueued edits; a failed commit leaves the overwritten state. Lock and queue read-modify-write operations are not synchronized across processes, so concurrent holders or enqueues can be lost.
- **Recovery ordering:** `src/server/check-gate-lock.ts:342` clears the lock before flushing, and recovery can overlap acquisition or another recovery. This can flush bookkeeping during a newly started check or remove its protection.

## Edge cases
The round-2 report’s source commit matches the reviewed implementation tree apart from task and report bookkeeping. Earlier source-fence and lifecycle findings remain unresolved; the earlier source conflicts are resolved according to the supplied landing checklist.

## Suggestions
Add end-to-end tests through the actual handoff and self-check paths, including overlapping processes, empty files and failed flush recovery.

## Verdict
needs some work — The check lifecycle is not wired to the new protection, and the deferred queue can lose data.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


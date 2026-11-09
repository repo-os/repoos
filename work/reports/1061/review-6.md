---
task: "1061"
pass: 6
at: "2026-11-08T21:38:37.890Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "80bcf3d06:a434d494b"
---
Repeated review classes: Lifecycle coverage, source-write protection, and queue concurrency remain incomplete. Worker hook installation, handoff drift wiring and ordered replay improved, but replay and recovery still have failure cases. A human should look at the recurring pattern.

## Relevance

still relevant — #0954 addressed task-file drift and #1059 skips some checks; neither provides the requested protections during checks.

## Evidence

None

## Bugs

- **Check lifecycle coverage:** [handoff.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/server/handoff.ts:327) acquires the lock only for the local check, after remote validation. Managed self-check and close-out validation also lack acquisition. Bookkeeping and source edits remain unrestricted in those windows.
- **Source-write protection:** [git.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/core/git.ts:432) provides a guarded writer with no production callers. An already-running engineer can write directly to source during a check.
- **Queue concurrency and recovery:** [check-gate-lock.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/server/check-gate-lock.ts:472) uses unsynchronized read-modify-write operations for queue entries and holders, so concurrent updates can be lost. Acquisition can join a lock while its final flush is running; dead-holder recovery also clears the lock before flushing. Either permits a flush to overlap a new check.
- **Snapshot replay and failure handling:** [check-gate-lock.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/server/check-gate-lock.ts:450) represents deletion as an empty string and restores it as an empty file. A crash or exception during replay can also leave an intermediate snapshot in the worktree; restoration is outside `finally`.
- **Drift detection:** [check-gate-bookkeeping.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/core/check-gate-bookkeeping.ts:48) compares endpoint trees before inspecting commits. A source change committed and then reverted during the check produces no net source diff and is accepted, although the check may have observed the intermediate code.

## Edge cases

The round-4 report source matches the reviewed implementation apart from report bookkeeping. Its disclosed lifecycle, direct-write and cross-process limitations remain.

## Suggestions

Add end-to-end coverage for actual check entry points, concurrent processes, deletion replay, interrupted flushes and source changes reverted during a check.

## Verdict

needs some work — Check coverage, source protection, queue durability and drift detection remain incomplete.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


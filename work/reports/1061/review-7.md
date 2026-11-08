---
task: "1061"
pass: 7
at: "2026-11-08T23:38:59.054Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "12e4176e1:a434d494b"
---
Repeated review classes: Lifecycle coverage, source-write protection, and queue recovery remain incomplete. Worker hook installation and committed-drift detection improved. A human should look at this recurring pattern.

## Relevance

still relevant — #0954 narrowed bookkeeping drift, but did not provide the requested protection and deferral across checks.

## Evidence

None

## Bugs

- **Check lifecycle coverage:** [check.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/commands/check.ts:2461) releases the managed self-check lock when remote validation returns, before the local check runs. Local-only and unmanaged checks also run without this lock. Bookkeeping commits can therefore move HEAD during those checks.
- **Source-write protection:** [check-gate-lock.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/server/check-gate-lock.ts:744) has no production filesystem-write caller. An already-running engineer can edit source directly during any locked gate. The handoff comparison in [handoff.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/server/handoff.ts:508) compares dirty filenames, not contents, so an edit and restoration during validation can escape detection. The required write-attempt test is absent.
- **Queue concurrency and recovery:** [check-gate-lock.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/server/check-gate-lock.ts:849) looks up the lock before acquiring the queue mutex. Release can flush and clear it before enqueue, leaving a late entry pending while subsequent bookkeeping commits proceed out of order. Replay also writes intermediate snapshots before persisting queue progress; a crash, or a later commit failure after an earlier replay succeeds, leaves disk at an intermediate state that fails the final-snapshot check on every recovery attempt. A crash between mutex-directory creation and its PID write likewise leaves an unrecoverable mutex.
- **Drift history traversal:** [check-gate-bookkeeping.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/core/check-gate-bookkeeping.ts:71) checks ancestry generally but walks only first parents. If the starting HEAD becomes a merge’s second parent, the walk includes older first-parent commits and can reject a bookkeeping-only merge for source changes predating the check.

## Edge cases

The round-5 report source matches the reviewed implementation; only report bookkeeping follows it. The supplied landing checklist reports no source conflicts.

## Suggestions

Exercise local checks, interrupted multi-entry replay, and enqueue/release races through production entry points.

## Verdict

needs some work — Local checks and source writes remain unprotected, and queue recovery can stall or reorder entries.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


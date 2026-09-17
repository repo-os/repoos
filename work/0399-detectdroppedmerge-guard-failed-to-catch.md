---
id: "0399"
title: "detectDroppedMerge guard failed to catch #0389's dropped merge to done"
type: bug
status: done
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/detectdroppedmerge-guard-failed-to-catch
created_at: "2026-09-17T17:36:38Z"
updated_at: "2026-09-17T18:30:14Z"
---
## Problem

Task #0389 ("Build the shared skill-guided built-in-agent runner and the
deterministic auto-fix verification gate") shows `status: done` on `main`,
and there is a commit `docs(0389): set status done` (81d50dda) — but the
actual code from its branch (`feat/build-the-shared-skill-guided-built-in-a`)
was never merged. `src/server/built-in-agent-runner.ts` and
`src/server/auto-fix-gate.ts`, the entire point of the task, do not exist
anywhere on `main`.

This is exactly the documented "class #1" failure in
`docs/close-out-pipeline.md` ("The merge that silently drops the branch's
work") — but that class is supposed to be caught by `detectDroppedMerge()`
in `src/server/integration-orchestrator.ts`. It was not caught here. This
task is to find out why the guard didn't fire and fix the regression/gap,
since it's a safety-critical guard for the close-out pipeline generally
(not just this one task).

## Evidence gathered so far

`.repoos/integration-jobs/0389.json` (still on disk):

```json
{
  "taskId": "0389",
  "branch": "feat/build-the-shared-skill-guided-built-in-a",
  "phase": "done",
  "enqueuedAt": "2026-09-17T15:15:35.816Z",
  "startedAt": "2026-09-17T15:15:35.866Z",
  "baseMainSha": "21eb035097e7d58556052ec80f5785a2959b7f90",
  "branchSha": "50376e60041d878ffe749e1f4af8b25f4ee5291c",
  "candidateSha": "21eb035097e7d58556052ec80f5785a2959b7f90",
  "version": 1
}
```

- `candidateSha === baseMainSha` — exactly the documented "Signature" of a
  dropped merge in `docs/close-out-pipeline.md`.
- `git diff 21eb0350 50376e60 --stat` shows a REAL 1346-line delta (the
  runner, the gate, the skill docs, several `work/*.md` files) — so this is
  not a "branch already merged, legitimately a no-op" case. The guard's own
  `git diff --quiet mainBranch...featureBranch` check (in
  `detectDroppedMerge`) should have detected this delta and failed the job
  with a non-retryable reason. It evidently didn't, since the job's
  recorded phase is `"done"`.
- Separately, `21eb0350` was NOT main's tip by the time this job finished —
  main had already advanced to `57bb9598` (task #0397's implementation
  commit landed in between). `validateCandidate()` is supposed to detect
  "main advanced" and resync from the new tip; whether that resync path
  interacts badly with `detectDroppedMerge` (e.g. a resync clearing/not
  updating `baseMainSha`/`candidateSha` correctly, or the final "done"
  transition reading a stale on-disk job snapshot that predates a
  since-corrected in-memory state) is an open question worth checking first
  — it's the most likely place a race or stale-read could let this through.

## Where to look

- `src/server/integration-orchestrator.ts`: `detectDroppedMerge()` (~line
  140) and its two call sites (~line 940 in `validateCandidate`, ~line 1456
  near publish).
- The "main advanced → resync" branch in `validateCandidate()` (~line
  870-885) — check whether `baseMainSha`/`candidateSha` bookkeeping across a
  resync could leave the publish-phase check comparing against a stale
  base.
- Whether `.repoos/integration-jobs/<id>.json` on disk can lag the
  in-memory job state such that a job legitimately caught by the guard
  in-memory still writes/leaves behind a `"done"` snapshot.

## Acceptance criteria

- [ ] Root cause identified with a reproduction (a synthetic branch +
      main-advance scenario that recreates `candidateSha === baseMainSha`
      despite a real delta), not just a guess.
- [ ] `detectDroppedMerge()` (or wherever the actual gap is) fixed so this
      class of failure cannot reach `phase: "done"` silently again.
- [ ] A regression test added that would have caught this specific gap.
- [ ] `repoos check` passes.

## Background

- #0389 itself needs to be manually landed for real (separate, already
  being done by hand) — this task is about the pipeline gap that let its
  done-marking through without the code, not about #0389's own content.
- `docs/close-out-pipeline.md` "Known failure classes and their guards" §1
  is the existing writeup of this failure class from its first occurrence
  (tasks 0306/0307/0309/0312, 2026-08-27). This is either a regression of
  that fix or a gap the original fix didn't cover.

## Activity

- 2026-09-17T17:36:38Z · created · unknown
- 2026-09-17T17:44:28Z · status inbox→ready
- 2026-09-17T17:44:31Z · status ready→active, branch
- 2026-09-17T17:55:57Z · status active→review
- 2026-09-17T18:30:14Z · status review→done, release:success

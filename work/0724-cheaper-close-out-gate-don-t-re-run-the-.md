---
id: "0724"
title: "Cheaper close-out gate: don't re-run the full suite on what the handoff gate already proved"
type: feature
status: done
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
merged_commit: 60e2c0160070a87e19b3b3ec458569a87413f0a7
assigned_to: ai
created_by: ""
branch: feat/cheaper-close-out-gate-don-t-re-run-the-
created_at: "2026-10-06T15:55:13Z"
updated_at: "2026-10-07T12:48:32Z"
last_close_out_gate_ms: 696914
last_close_out_gate_at: "2026-10-07T12:48:22.345Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-07T12:21:44.271Z: server-side finalization timed out (deadline exceeded)"
review_passes: 2
review_rounds: 1
---
## Problem

Every Move to done re-runs the FULL gate on a candidate worktree: install, build, lint and the whole test suite (~420 test files, ~5,100 tests, about 230-290 s of tests plus install/build, so a healthy remote close-out is ~285 s median and a bad one is 20-40 min). The same commit already passed the identical full gate at handoff (pre-review remote gate, ~290 s median). On 2026-10-06 close-out was where most of the wall time went, and a flaky test failing it meant a fresh 5+ minute attempt each time (agent-review.test.ts failed four close-outs/gates).

Close-out is not strictly redundant: the candidate is the branch MERGED with current main, so it can differ from what the handoff gate tested when main moved. That is the part that needs checking, not the whole suite again.

## Desired UX

- At close-out, compare the candidate tree with what the handoff gate validated (the lock sha / tested tree). If the merge into main was trivial (main only advanced with bookkeeping, or the candidate tree equals the tested tree), SKIP the full suite: run only the cheap steps (build/typecheck, lint/format, task-asset guard) and record 'full suite reused from handoff check <run id/sha>'.
- If main moved with real code changes, run a SCOPED suite: the tests affected by the union of (files changed by the task) and (files changed on main since the tested base), via the existing --changed <ref> machinery (#0695), plus build/lint. Keep an escape hatch: setting closeOut.gate = full | scoped | reuse (default scoped), a Settings control, and 'full' always for releases and for machinery paths a repo declares (e.g. [[check.fullSuitePaths]]).
- Any failure falls back to the full suite once before failing the close-out (so a scoped miss costs time, not correctness).
- The run record states which mode ran and why (reused / scoped N files / full), so it is auditable in the Checks tab.

## Acceptance criteria

- Tests: identical tree -> reuse (no test step run); bookkeeping-only drift -> reuse; real code drift -> scoped run with the right --changed base; machinery path or release -> full; scoped failure -> full retry; setting honoured.
- Measure and record before/after median close-out time in the task notes. Settings control + docs (docs/close-out-pipeline.md, user-docs/check.md). repoos check passes.

## Notes for AI

VERIFY the assumption first: confirm from src/server/integration-orchestrator.ts what the close-out validate step runs today and whether the candidate tree can be compared to the handoff-tested tree (lock sha, check_runs.candidate_sha in checks.db). If skipping is unsafe for some reason, say so in the task and implement only the scoped mode. Related: #0717 (smaller uploads), #0720 (slow-run alert), #0679 (close-out reliability), #0695 (scoped remote self-checks).

## Implementation notes
VERIFIED the assumption first: `validateCandidate` (src/server/integration-orchestrator.ts) ran the FULL plan at every close-out via `CLOSEOUT_CHECK_ARGS` (--profile full), and the handoff-tested tree IS recoverable — `check_runs.candidate_sha` in checks.db holds the exact SHA the latest green, full, remote pre-review run validated (#0694). So both reuse and scoping are safe to implement; no fallback to scoped-only was needed.

What landed:
- New pure decision module `src/core/close-out-gate.ts` (planCloseOutGate + touchedFullSuitePath) and `planCloseOutGateFromGit` (exported from integration-orchestrator) that compares the merged candidate TREE (git diff --quiet) against the tested tree and main's advance.
- Modes: reuse (identical tree, or bookkeeping-only drift) → cheap steps only, tests step records skipped; scoped → `--changed <tested base>` locally (REPOOS_CHECK_CHANGED) and on the runner (changedRef); full → `closeOut.gate = full`, a `[[check.fullSuitePaths]]` prefix, or a release.
- Scoped failure re-runs the identical full suite once before failing (bounded; the pipeline budget still gates it).
- `check_runs.detail` records the mode and why via REPOOS_CHECK_GATE_NOTE, visible in Checks → Runs.
- Settings → General → "Close-out gate scope" (select) and Advanced → "Always-full-suite paths" (array), plus docs (docs/close-out-pipeline.md, user-docs/check.md, user-docs/configuration.md, docs/contrast-audit.md).

Timing: I could NOT measure real before/after close-out medians from this sandbox — the worktree has no `.repoos/checks.db` and I must not read the main checkout, so no historical close-out rows are available here. What I did measure is the mechanism's ceiling: this repo has 433 test files under src/ui-app/tests; a reuse close-out runs 0 of them (only build/lint/static guards), and a scoped close-out runs only the files the task's + main's changes affect. The concrete before/after medians still need a live board: compare `check_runs` close-out `duration_ms` before and after this lands (the run `scope`/`detail` now names the mode). I did not invent numbers for it.

## Shots
```json
[
{
"label": "Settings → General with the new Close-out gate scope select",
"target": "default",
"route": "/settings?tab=general",
"highlight": "#setting-closeOut\\.gate",
"steps": [
  {
    "waitMs": 500
  }
]
}
]
```

## Review round 2
Fixed the review's real bug: a SCOPED remote run that failed used to fail the close-out immediately (the runner stops before the local check ever runs), skipping the scoped->full escape hatch. `validateCandidate` now retries the runner once WITHOUT `changedRef` on a non-transient scoped remote failure, mirroring the local path; a transient infra failure keeps its retryable resume-from-check handling, and a genuine full-run failure still fails. When the remote retry succeeds as full, the local cheap checks also drop `REPOOS_CHECK_CHANGED` so both halves describe the same scope.

Also addressed the misleading skip text: the tests step now reads `skipped — full suite reused from the handoff gate (<why>)` for a reuse close-out instead of claiming the remote runner ran when none did (REPOOS_CHECK_GATE_NOTE drives it).

New orchestrator-level tests (`close-out-gate-remote-retry.test.ts`): scoped remote fail -> full retry passes -> close-out not failed (asserts the two runner calls: first with `changedRef` = tested SHA, second without); and scoped remote fail + full retry also fail -> close-out fails with the runner detail.

Still open by design: reuse requires a recorded green FULL pre-review row (no remote validation => full suite, fail-safe); real before/after close-out `duration_ms` medians still need a live board — not invented here. A Settings shot for the new 'Close-out gate scope' select is declared.

## Activity

- 2026-10-06T15:55:13Z · created · unknown
- 2026-10-07T09:47:13Z · status inbox→ready
- 2026-10-07T09:47:15Z · status ready→active, branch
- 2026-10-07T10:11:18Z · body
- 2026-10-07T10:12:50Z · body
- 2026-10-07T10:14:25Z · body
- 2026-10-07T10:16:02Z · body: section Implementation notes
- 2026-10-07T10:18:07Z · body
- 2026-10-07T10:19:41Z · body
- 2026-10-07T10:35:34Z · note: Owner requests current engineering/review tasks through to done for next release, after v0.5.67 release. Driver sees remote gate PASS302sbee10:26:07 and processlastoutput10:26:48. If implementation and scoped check are complete, request handoff ONCE then end turn. Do not repeatedly run passing full suites. Record why gate reuse is safe for combined current-main tree and what forces full rerun; preserve full fallback. If provider has stalled, report it explicitly. No source writes after handoff, owner config/hosts/releases/main untouched.
- 2026-10-07T10:51:59Z · body
- 2026-10-07T10:53:27Z · body
- 2026-10-07T10:55:26Z · status active→review
- 2026-10-07T10:55:28Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-07T10:57:10Z · note: review pass 1: needs some work
- 2026-10-07T10:57:11Z · status review→active
- 2026-10-07T11:08:31Z · note: Owner deadline12:07Z: complete fouractive tasks720/724/730/737 throughreviewanddone. Prioritize reviewer remote-scopedfailure->onefullfallback repair with orchestrator regression; keepscope. Buildthenonescopedcheck, handoffonce/endturn. Driver verifiesSettingscontrolactualshot andcombinedtreegate; no repeatedpassingfullgates forlocal-onlyfailures, nohost/config/releasewrites.
- 2026-10-07T11:57:02Z · body: section Shots
- 2026-10-07T11:58:10Z · body
- 2026-10-07T11:59:31Z · body: section Review round 2
- 2026-10-07T11:59:43Z · body: section Review round 2
- 2026-10-07T12:00:04Z · status active→review
- 2026-10-07T12:00:05Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-07T12:01:02Z · note: review pass 2: good to go
- 2026-10-07T12:43:31Z · body
- 2026-10-07T12:48:22Z · close-out gate completed in 697s
- 2026-10-07T12:48:32Z · status review→done, release:success

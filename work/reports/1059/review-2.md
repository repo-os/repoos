---
task: "1059"
pass: 2
at: "2026-11-08T10:50:55.569Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/check-gate-skip-the-full-suite-when-the-
state: ok
tree_identity: "ff8cd785b:ff8cd785b"
---
## Verdict
needs some work — Empty diffs skip ordinary full checks, and docs-only progress totals stay overstated.

## Relevance
still relevant — The base branch has not added this shortcut; the broader bookkeeping-only check problem remains.

## Evidence
The current `ff8cd785b` capture shows the toggle on Settings → Advanced; the route matched and no console errors were recorded.

## Bugs
- **Vacuous allowlist match:** `src/core/check-docs-only.ts:4-6` accepts an empty path list, and `src/commands/check.ts:2234-2245` classifies a clean `main` checkout as docs-only. A normal `repoos check` there skips the full suite despite no docs/bookkeeping diff. The same predicate is used by handoff and close-out; preserve legitimate no-op close-out behavior without making an ordinary clean check skip.
- **Progress accounting:** `src/commands/check.ts:2015-2027` counts docs-only-skipped steps in `stepsTotal`, but excludes skipped results from `stepsDone`. The check’s reported progress therefore never reaches its total in docs-only mode.

## Edge cases
The engineering report is stale: it describes `91c415b`, while the reviewed HEAD is `ff8cd785b`; no current-round report was provided, so its claims are not evidence.

## Suggestions
None found

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-08T10:17:39.241Z).
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-runner.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-runner.test.ts.


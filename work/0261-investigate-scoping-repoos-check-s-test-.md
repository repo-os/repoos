---
id: "0261"
title: Investigate scoping repoos check's test run for the integration pipeline
type: perf
status: inbox
priority: p3
area: core
assigned_to: ai
created_by: ""
branch: ""
model_override: default
created_at: "2026-08-19T18:56:34Z"
updated_at: "2026-08-19T18:57:06Z"
---
## Problem

`repoos check` always runs the ENTIRE vitest suite (83 test files, ~1,310
tests) via `bun run test` → `vitest run --config src/ui-app/vite.config.ts`
(`src/commands/check.ts`), with no `--changed` scoping, no cache, and no
incremental typecheck (`tsconfig.json` has no `incremental`/`composite`
flags). Measured on this machine: a clean `tsc` typecheck is ~2.4s, `vue-tsc`
~4.6s, `vite build` ~1.8s — build+typecheck together are only ~9s and are NOT
the bottleneck. The full vitest run is ~28-30s on an idle machine (and much
more under concurrent load) and dominates the non-UI-smoke-test portion of
check's wall time. This is paid in full on every integration-pipeline
`check` run regardless of how small the change being validated is.

This is a much lower-priority, lower-confidence win than #0260 (the UI smoke
test's live-board coupling) — see that task first, it's the bigger and safer
win. This task is explicitly a follow-up investigation, not a pre-decided
implementation, because the obvious lever (scoping tests to changed files)
trades off against correctness guarantees of a merge gate.

## Desired UX

Investigate whether `repoos check`, when invoked from the integration
pipeline specifically (not when a human/agent runs it locally), can safely
run a narrower slice of the suite — and report back a recommendation rather
than assuming any specific approach is right.

## Questions to answer (this is a research task, not a build-it-now task)

- [ ] Does `vitest --changed` (scoped to files changed since main, using
      vitest's own git-diff + import-graph analysis) reliably catch
      cross-file regressions in this codebase, or does its coverage miss
      indirect breakage (e.g. a shared type change, a config schema change)
      often enough that scoping would weaken the merge gate in practice?
- [ ] Would enabling TS `incremental`/`composite` in `tsconfig.json` meaningfully
      help, given build+typecheck is already only ~9s? (Likely marginal —
      confirm before spending effort here.)
- [ ] Is there a middle ground — e.g. always running the full suite for
      `repoos check` invoked by a human/agent locally, but a fast/scoped
      variant only for the pipeline's automated gate, with the full suite
      still required before merge to catch anything scoping missed?
- [ ] What's the actual expected time savings, measured, not estimated?

## Acceptance criteria

- [ ] A written recommendation (in this task's Activity or a follow-up
      comment) on whether to pursue test scoping, with a real before/after
      timing comparison — not implemented without that data first.
- [ ] If the recommendation is "do it," a properly scoped follow-up task with
      the actual implementation, not bundled into this one.

## Notes for AI

- Do NOT reduce the coverage of `repoos check` when run manually/locally —
  any scoping is pipeline-invocation-specific only, never the default.
- Do NOT implement TS incremental builds speculatively — the ~9s baseline
  suggests it's not worth the complexity; confirm with a real measurement
  before touching tsconfig.json.
- See #0260 for the UI smoke test fix — do that one first; it's independently
  worth more and carries much less risk.

## Original prompt

Follow-up from a conversation about why `repoos check` / the integration
pipeline's check phase is slow: after finding the UI smoke test's live-board
coupling (#0260) as the primary, safe fix, this task captures the secondary,
lower-confidence lever (scoping the full vitest run) as something to
investigate rather than implement outright, since it trades off against
merge-gate correctness.

## Activity

- 2026-08-19T18:57:06Z · body

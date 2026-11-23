---
task: "1275"
pass: 6
at: "2026-11-23T08:20:52.399Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/close-outs-validate-several-tasks-at-onc
state: ok
tree_identity: "1f7a29b74:1886dad1c3"
---
## Verdict
`needs some work` — pass-5 scheduler/status/checkout fixes look correct, but `main` conflicts in `tasks.ts` and `integration-pipeline-ui.ts` block landing.

## Relevance
`still relevant` — main still serialized close-out validation before this branch; parallel validation addresses the observed queue backlog.

## Evidence
None

## Bugs
None found

## Edge cases
Round-4 fixes verified: `withMainCheckout` wraps release stamp and gate-duration writes; `failOrReconcile` retries review restoration; cooling heads pass `unavailable` into `selectCloseOutStarts`; `buildIntegrationSnapshot` marks only the executing publish head as `active`. Shots show “Also running” parallel pipeline UI and Settings `maxParallelValidations` (default 2); ui-verification recorded zero console errors on tree `1886dad1c3` (bookkeeping-only delta to reviewed HEAD). Accept criteria: config key + Settings control, overlap tests, `docs/close-out-pipeline.md`, API/UI parallel fields — present in diff.

## Suggestions (non-blocking)
- **Class: scheduler capacity** — `selectCloseOutStarts` still seeds `inFlight` from `running.size`, so an in-flight publisher alongside one validator can block a third validation under `limit: 2` (`integration-job.ts:209`); subtract publishing runs or count validating phases only.
- Sync `main` (`repoos sync 1275`) before close-out.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-23T08:19:42.201Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


---
task: "1275"
pass: 2
at: "2026-11-22T09:01:20.213Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/close-outs-validate-several-tasks-at-onc
state: ok
tree_identity: "11bd41ff7:6d23ece96e"
---
## Relevance
still relevant — main still processes close-outs serially.

## Evidence
None

## Bugs
- **Class: timeout budget** — `integration-orchestrator.ts:1817` resets the attempt budget even without a wait. Publish-time drift can repeatedly reset it, violating the configured per-attempt ceiling.
- **Class: scheduler liveness** — `integration-job.ts:185` applies the validation limit and pressure hold to a parked publisher that becomes head. A later slow validation can therefore block its publish.
- **Class: live configuration** — `routes/config.ts:1041` saves a higher parallel limit without waking the pump; queued work waits until another event or run finishes.
- **Class: pipeline UI contract** — `integration-pipeline-ui.ts:203` treats a parked publisher as stalled after three minutes, offering unnecessary recovery actions. `closeOutAttempt.ts:13` also ignores parallel starts, making failure cutoffs drift with snapshot time.
- **Class: queue ordering** — `integration-job.ts:454` sorts only by millisecond enqueue time. Ties follow filename order, not enqueue order, so publication can overtake an earlier request.
- **Class: accessibility** — `IntegrationStatusBar.vue:679` adds a native `title` tooltip, contrary to the repository’s keyboard- and touch-accessible tooltip convention.
- **Class: integration test coverage** — `close-out-parallel.test.ts` tests selections rather than actual overlapping runs or failure isolation in the live pump.

No further findings of this class were found after grepping: scheduler, cancellation, timeout paths, config saves, pipeline consumers, tests and docs.

## Edge cases
The report source matches the implementation tree. Both captures show the intended UI; handoff recorded no console errors.

## Suggestions
None found

## Verdict
needs some work — scheduling, timeout, UI and coverage defects need fixes.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T08:59:25.885Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


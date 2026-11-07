---
task: 1049
pass: 4
at: "2026-11-07T17:20:08.347Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-validation-stop-killing-healthy-r
state: ok
tree_identity: "793d1f0fe:c6b09afe1"
---
## Verdict
needs some work — explicit container inactivity is ignored whenever the host is known to be busy.

## Relevance
still relevant — main does not contain these hang-detection and cleanup protections.

## Evidence
None

## Bugs
- **Runner-inactivity gating** (`src/server/remote-validation.ts:1408-1422`): `detectHungRun` suppresses a hang when load is known busy, even if the runner reports the container is inactive; it also suppresses an inactive-container sample when load is unknown but the last known load was busy. The test at `src/ui-app/tests/remote-host-pool.test.ts:2496-2504` encodes this behavior, while `docs/remote-validation.md` says either an idle host or an inactive container triggers a hang. A stalled run on a busy host can therefore remain alive until its run timeout instead of being identified and retried.

## Edge cases
No live runner Docker cleanup was exercised; the report says reaper behavior was verified with timestamp and scheduling fixtures.

## Suggestions
The latest declared capture (`default-4.png`) clearly shows the expanded remote event and evidence. The initial auto capture shows Mission Control, not the changed Debug UI.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


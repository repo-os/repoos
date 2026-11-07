---
task: 1049
pass: 6
at: "2026-11-07T19:24:26.276Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-validation-stop-killing-healthy-r
state: ok
tree_identity: "b6c95ab32:c6b09afe1"
---
Repeated review classes: reaper scheduling and prefix matching, evidence visibility and truncation, kill-condition reporting, timestamp portability, and inactive-sample gating are fixed. Reaper ownership/timeout ordering remains unfixed; a human should look at this recurring reaper pattern.

## Relevance
still relevant — main does not contain these protections, and nearby tasks do not supersede this problem.

## Evidence
None

## Bugs
- **Reaper can kill an active run** (`src/server/remote-validation.ts:1026-1045, 6167, 4035-4045`; `docs/remote-validation.md:433-436`; `src/ui-app/tests/remote-host-pool.test.ts:2680-2740`): The reaper removes any prefixed container older than 25 minutes, without checking active ownership. But the remote timeout adds the full 15-minute lock-wait allowance to the 25-minute run timeout—even when the lock is acquired immediately—so a healthy container can run for up to 40 minutes and be force-removed at 25. The docs’ claim that an active run cannot own such a container is therefore false. The reaper test checks removal of a stale candidate, not preservation of an active run.

## Edge cases
No live runner cleanup was exercised. The engineering report’s source commit matches the reviewed code; the changes since it are report bookkeeping. The landing checklist reports only the task’s own work-file conflict.

## Suggestions
`default-4.png` shows the expanded remote evidence, but is stale for reviewed HEAD `927bdc7`; recapture after the fix.

## Verdict
needs some work — the reaper can force-remove a healthy run before its actual timeout.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


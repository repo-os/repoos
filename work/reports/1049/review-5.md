---
task: 1049
pass: 5
at: "2026-11-07T18:24:09.364Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-validation-stop-killing-healthy-r
state: ok
tree_identity: "b6c95ab32:c6b09afe1"
---
## Relevance
still relevant — main has not landed these protections; nearby tasks do not supersede the problem.

## Evidence
None

## Bugs
- **Reaper ownership / timeout ordering** (`src/server/remote-validation.ts:1026-1050, 4035-4046, 6167`): The reaper filters by age and name but never checks whether an active run owns the container. The run timeout adds the full 15-minute lock-wait allowance even when the lock is acquired immediately, so a healthy container can still be running after the reaper’s 25-minute cutoff and be force-removed. Exclude active owned containers and cover that case in a test.

## Edge cases
The landing checklist reports only the task’s own work file conflict, resolved from main; no source conflict. The engineering report’s source tree matches the implementation, apart from report bookkeeping.

## Suggestions
The recorded handoff auto capture is stale for HEAD. The available `default-4` shows the expanded remote evidence, but is not recorded as the final handoff capture.

## Verdict
needs some work — the reaper can remove a still-active validation run.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


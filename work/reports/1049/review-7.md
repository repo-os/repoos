---
task: 1049
pass: 7
at: "2026-11-07T19:55:39.284Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-validation-stop-killing-healthy-r
state: ok
tree_identity: "d2f6cf141:c6b09afe1"
---
Repeated review classes: reaper scheduling/prefix matching, evidence visibility/truncation, kill-reason reporting, timestamp portability, and local inactive-sample gating are fixed. Reaper ownership is only guarded within this process; a cross-process race remains below. A human should review this recurring pattern.

## Relevance
still relevant — the base branch does not include these protections, and the original failure mode remains.

## Evidence
None

## Bugs
- **Diagnostic secret redaction bypass** (`src/server/remote-validation.ts:827-830, 5583-5592, 5688-5700`): `docker logs` is written into remote-validation events via `newestHangLogOutput`, which does not call `redactSecrets`; `appendRemoteValidationEvent` serializes it unchanged. Both automatic and manual kills can persist secrets printed by tests or installers, unlike the redacted raw-log path.
- **Unreliable progress samples can still kill healthy runs** (`src/server/remote-validation.ts:1325-1328, 1412-1415, 6247-6275`): A single `docker stats --no-stream` result of `0.00%` is treated as conclusive inactivity, even for an I/O- or network-bound progressing run. Also, a slow in-flight probe leaves the previous load sample active until it resolves, so a stale idle reading can trigger a kill. The tests cover static samples, not these cases.
- **Reaper can miss another process’s active run** (`src/server/remote-validation.ts:4041-4065, 4512-4544, 4625-4630`): The idle check uses cached host-lock occupancy; `s.reaping` blocks only this pool’s dispatch, and the removal-time ownership check only examines local `activeRuns`. A stale lock snapshot can therefore allow removal of a >25-minute container owned by another process.
- **Merge blocker**: the server’s landing preflight reports a conflict in `src/ui-app/src/stores/repo.ts`; this needs resolution before sign-off.

## Edge cases
Tests do not cover native/I/O-bound progress, a slow probe while a prior idle sample is cached, or cross-process reaper ownership.

## Suggestions
The handoff screenshot is stale (tree `c6b09afe1`, reviewed HEAD `f7fdd5695`); recapture the expanded Debug drawer after the code issues are fixed.

## Verdict
needs some work — evidence leaks secrets, hang/reaper races remain, and the branch conflicts with main.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


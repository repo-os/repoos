---
task: "1060"
pass: 13
at: "2026-11-08T18:18:26.254Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-browser-capture-runner-never-exit
state: ok
tree_identity: "f78db5fad:f78db5fad"
---
Repeated review classes: provider cancellation parity, live-capture reaper scheduling, reaper reporting, and startup-inspection containment are fixed; cancellation-failure reporting is still unreliable. A human should look at this recurring failure-handling pattern.

## Relevance
still relevant — #1049 addresses validation hangs; this task addresses completed browser captures lingering.

## Evidence
None

## Bugs
- **Cancellation failure masking** (`src/server/remote-validation.ts:1208-1210, 3384, 5108, 6083, 6416`): `killContainerCommand` ends with `|| true`, so Docker removal failures appear successful. Both provider cancellation hooks can report cancellation while the container remains; the existing manual and watchdog kill paths also treat the masked result as success. The cancellation test stubs a failing command result directly, bypassing the shell’s `|| true`, so it misses this failure. A surviving capture can keep occupying the runner after the handoff releases its wait.

## Edge cases
The handoff screenshot is current, nonblank, and matched `/` with zero console errors, but shows generic Mission Control rather than capture details. The engineering report says physical runners were not tested.

## Suggestions
Strengthen the collector test’s Docker stub to assert the running-container and removal behavior, rather than returning success for every Docker command.

## Verdict
needs some work — Docker removal failures are masked, so cancellation can leave stale captures behind.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-08T18:13:26.243Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


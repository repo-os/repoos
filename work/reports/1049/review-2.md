---
task: 1049
pass: 2
at: "2026-11-07T15:03:04.868Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-validation-stop-killing-healthy-r
state: ok
tree_identity: "b73a6de25:c6b09afe1"
---
## Verdict
needs some work — hang-condition reporting and evidence preservation have gaps.

## Relevance
still relevant — main has earlier watchdog logic, but not these protections against flaky remote observations.

## Evidence
`auto: matched src/ui-app/**` — `/` shows Mission Control, not the changed DebugPanel hang-evidence UI; zero console errors were recorded.

## Bugs
- **Hang-condition reporting:** `src/server/remote-validation.ts:6160-6163, 6282-6298` logs only “looks hung,” then always reports “while the host was idle,” even when the condition was `container-inactive`. The result event and Runners tab can therefore misstate why the run was killed.
- **Alternate teardown skips evidence capture:** `src/server/remote-validation.ts:4282-4305, 5473-5481` lets the manual/CTO kill path remove a hung run’s container without `captureHangEvidence`; its resulting event has no logs or inspect state.
- **Captured evidence loses the newest output:** `src/server/remote-validation.ts:5573-5576` keeps only the first 2,000 characters of `docker logs --tail 100`, discarding later—and potentially most relevant—lines. The inspect state is also cut mid-output.

## Edge cases
Engineering report source `c6b09afe1` matches the reviewed implementation; only task/report bookkeeping changed afterward.

## Suggestions
None found

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-07T14:59:11.356Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


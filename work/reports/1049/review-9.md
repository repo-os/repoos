---
task: "1049"
pass: 9
at: "2026-11-07T22:59:39.081Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-validation-stop-killing-healthy-r
state: ok
tree_identity: "f67b13a00:c6b09afe1"
---
Repeated review classes: Reaper scheduling/prefix matching, evidence capture and redaction, timestamp parsing, hang detection, stale-probe handling, and lock-aware timeouts are fixed. The same-user reaper race is now serialized, but ownership and reason visibility still have gaps; a human should look closely at these recurring patterns.

## Relevance
still relevant — main does not include this task’s safeguards, evidence capture, or container reaper.

## Evidence
None

## Bugs
- **Reaper ownership across users** (`src/server/remote-validation.ts:1397-1414, 2020-2028`): The reaper lease and slot check use `$HOME/.repoos-validate-locks`. A run started under another SSH user has a different lock root, so the reaper can see no occupied slot and remove that user’s active container. The final lease fixes the same-user race, not this case.
- **Cleanup threshold exceeds the specified run cap** (`src/server/remote-validation.ts:800-805, 1040-1044, 1095-1106, 4219-4223`; `docs/remote-validation.md:438-443`): Candidates are only eligible after 45 minutes (40-minute cap plus margin), although the 25-minute run timeout begins after lock acquisition and the container is created only after that acquisition. This leaves eligible leaked containers unreaped for an extra 20 minutes.
- **Hang cause missing from Runners tab** (`src/server/remote-validation.ts:6520-6523`; `src/ui-app/src/components/RemoteRunnersPanel.vue:430-440`): The backend records the condition in `detail`, but neither the active “hung · killing” badge nor the historical Hung runs row renders it. The Debug event shows the reason; the Runners tab does not meet the stated visibility requirement.

## Edge cases
The supplied engineering report is stale (source commit `8c3e9e1`, not reviewed HEAD `f67b13a`); there is no matching current-round report.

## Suggestions
The declared Debug capture is stale for this HEAD; recapture it after fixes. No other suggestions.

## Verdict
needs some work — reaper ownership, cleanup timing, and Runners-tab cause visibility remain incomplete.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


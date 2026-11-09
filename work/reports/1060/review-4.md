---
task: "1060"
pass: 4
at: "2026-11-08T10:31:24.879Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-browser-capture-runner-never-exit
state: ok
tree_identity: "e46993f3c:"
---
## Verdict
needs some work — the startup reaper can silently remove captures, missing the required debug event.

## Relevance
still relevant — #1049 covers validation-run hangs; this adds recovery for completed browser captures.

## Evidence
None

## Bugs
- **Reaper observability gap:** `scripts/remote-runner/validate.sh:68-86` removes completed, idle capture containers with output redirected to `/dev/null`. Unlike the periodic reaper and force-collector, this startup path records no event or reason, so the removal is invisible in Debug UI/events. This affects both Hetzner and Tailscale hosts using the script.

## Edge cases
The round-4 report’s source commit (`e46993f`) matches the implementation; its report notes no live runner was exercised.

## Suggestions
None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


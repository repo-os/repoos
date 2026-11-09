---
task: "1060"
pass: 2
at: "2026-11-08T09:21:32.342Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-browser-capture-runner-never-exit
state: ok
tree_identity: "c8d565306:"
---
## Relevance
still relevant — #1049 covers validation-run hangs, not completed browser-capture lifecycle.

## Evidence
None

## Bugs
- **Provider coverage:** Hetzner captures still await `runRemote` without polling for `result.json` (`src/server/remote-validation.ts:3635`); the collector and completed-capture reaper run only in `TailscaleRunner` (`:4387`, `:6851`). The shared startup sweep also excludes running containers (`scripts/remote-runner/validate.sh:64-65`). Thus the collector and reaper acceptance criteria fail for Hetzner captures.
- **Cancellation failure masking:** Both provider cancellation methods swallow remote-kill failures, then record that captures were cancelled (`src/server/remote-validation.ts:3077-3098, 5743-5764`). If SSH is unavailable, the capture can remain alive and block retries while the event reports success. Record the failure and avoid claiming cancellation succeeded.

## Edge cases
The engineering report is stale: it cites `62f764e`, not reviewed HEAD `c8d5653`; no current-round report was provided, so its claims were not treated as evidence. The prior review’s Hetzner-cancellation finding is now addressed.

## Suggestions
None

## Verdict
needs some work — Hetzner collection/reaping is missing, and failed cancellation can be reported as successful.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


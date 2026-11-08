---
task: "1060"
pass: 3
at: "2026-11-08T10:01:29.829Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-browser-capture-runner-never-exit
state: ok
tree_identity: "405f71f14:"
---
## Verdict
needs some work — the periodic reaper cannot reap a completed capture while its remote run is still active.

## Relevance
still relevant — #1049 covers validation-run hangs; this adds capture-specific collection and cancellation.

## Evidence
None

## Bugs
- **Reaper scheduling excludes live captures on both providers.** `RemoteValidationRunner.maybeRunReaper` returns while `activeJobs > 0` (line 3300), and `TailscaleHostPool.probeDueHosts` runs the reaper only when `effectiveActive(s) === 0` (line 4591). Meanwhile, both providers register active capture container names in `liveContainerNames` (lines 3473–3477 and 5575–5579), which `runValidationContainerReaper` excludes (lines 1531–1538). Thus the periodic reaper cannot collect the completed-but-still-running capture that triggered this task; the startup sweep only helps if another run starts. The result-file poll is a separate recovery path, but does not make the reaper/watchdog criterion work.

## Edge cases
The round-3 engineering report’s source commit matches HEAD. No live Tailscale or Hetzner runner was exercised; the report describes command-level and fake-exec tests.

## Suggestions
None.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


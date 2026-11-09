---
task: "1060"
pass: 14
at: "2026-11-08T19:40:07.765Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/remote-browser-capture-runner-never-exit
state: ok
tree_identity: "ad01e86db:f78db5fad"
---
Repeated review classes: provider parity, reaper scheduling and reporting, startup failure containment, and masked Docker removal failures have targeted fixes. Failure reporting still has a related inconsistency below; a human should examine the recurring pattern.

## Relevance

still relevant — #1049 covers validation hangs; completed capture collection and cancellation remain necessary.

## Evidence

None

## Bugs

- **Kill-failure reporting and teardown ordering** ([remote-validation.ts](/Users/nick/code/nick/repoos-worktrees/feat/remote-browser-capture-runner-never-exit/src/server/remote-validation.ts:6432)): `finalizeHungKill` detects a failed Docker removal but still starts remote run cleanup, releases the slot and settles the run. The subsequent hung-run result says the container “was removed” and retried, even when removal failed. A surviving container can retain resources while its run files are removed, and the result misleads operators. Check both timeout and nonzero-exit paths when fixing this class.

## Edge cases

The engineering report is stale: its source commit is `f78db5fad`, while reviewed HEAD is `ad01e86db`. No current-round report was supplied, so its test and rationale claims are not evidence for HEAD. Physical runner behavior remains unverified.

## Suggestions

Re-capture `auto: matched src/ui-app/**` on HEAD and show a pipeline card. The existing `/` screenshot is nonblank and route-matched but stale and shows Mission Control, not the changed cards. The recorded console check reports zero errors.

## Verdict

needs some work — failed watchdog removal still triggers cleanup and is reported as a successful removal.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-08T18:13:26.243Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


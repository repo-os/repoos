---
task: "1060"
pass: 1
at: "2026-11-08T08:24:42.586Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/remote-browser-capture-runner-never-exit
state: ok
tree_identity: "c2aede060:"
---
## Verdict
needs some work — failed handoffs do not cancel captures on the Hetzner runner

## Relevance
still relevant — the recent task history still records repeated browser-capture timeouts, and this branch adds lifecycle recovery for them.

## Evidence
None

## Bugs
- **Provider cancellation parity:** `cancelBrowserCaptures` is implemented only by `TailscaleRunner`. `RemoteValidationRunner` also accepts `browserCapture` requests but has no cancellation implementation, so the failed-handoff calls in both `handoff.ts` and `finalizeReviewHandoff` silently do nothing for that provider. Its queued or running capture can still outlive a failed handoff and delay a retry. Implement cancellation for that provider or prevent unsupported captures from being dispatched there.

## Edge cases
None

## Suggestions
None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


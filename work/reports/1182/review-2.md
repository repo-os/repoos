---
task: "1182"
pass: 2
at: "2026-11-18T09:55:05.496Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/qa-pass-android-hub-web-ui-second-pass-s
state: ok
tree_identity: "64e7e731c:"
---
## Verdict
needs some work — the lock fixture can bypass device authentication when its query parameters are present.

## Relevance
still relevant — #1171 covered the 375px baseline; this task adds settings, failure and lock coverage at 360px and 412px.

## Evidence
None

## Bugs
- **Class: Production fixture bypass** — [mobile/src/lock.ts](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-android-hub-web-ui-second-pass-s/mobile/src/lock.ts) accepts `?fixture=lock&auth=success` and returns success before calling the native biometric plugin. Fixture selection has no development-only guard, so a production Hub session with those query parameters can unlock without authentication. Gate the result to browser development or a test-only build.
No further findings of this class were found after grepping: `mobile/src/fixture.ts`, `mobile/src/lock.ts`, `mobile/src/app-state.ts`, `mobile/src/App.vue`, `mobile/src/platform.ts`, `mobile/scripts/fixture-qa.ts`.

## Edge cases
The browser fixture covers overlay retry transitions, but does not validate Android’s native biometric prompt or WebView behavior; the QA document correctly states this limitation.

## Suggestions
None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


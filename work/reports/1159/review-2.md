---
task: "1159"
pass: 2
at: "2026-11-17T20:04:23.927Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-android-hub-app-on-the-p
state: ok
tree_identity: "5c8344768:"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: the new Cancel/retry lock UI is uncaptured and live discovery waits on human #1162.

## Relevance
`still relevant` — this is the only device-level QA pass for the Hub picker, themes, discovery, lock and back gesture, and its two fixes are still worth landing.

## Evidence
- Missing: a capture of a server-scope lock rejection showing the new Cancel action, and of a successful retry replaying the pending server open — `lock-fail-closed-final.png` shows only the non-cancelable reopen gate.
- Stale: `settings-light.png`, `settings-dark-final.png` and the 16 theme captures predate main's dev-updates card, so the merged Settings screen has no current capture.
- Missing: `tailnet-discovery.png` is the no-trusted-server empty state; discovery rows from a reachable trusted server are unverified (human #1162).

## Bugs
None found

No further findings of this class were found after grepping: `App.vue` gate/retry/cancel callers (`onMounted`, `onSelect`, `retryLock`, `cancelLock`), `LockOverlay.vue`, `lock.ts`/`lock-state.ts`/`lock-context.ts`, `back-navigation.ts` `lockOpen`, `form-validation.ts`/`AddServerView.vue`/`app-state.ts` error paths, the `mobile-*.test.ts` files, and the diff for bare `node`/`npm`/`npx`.

## Edge cases
- Lock retry/cancel has no in-flight guard: `gateLock` applies a late verification result, so a tap landing as the biometric prompt closes can clear `lockContext` and then re-open the overlay with null context — "Try again" no-ops and Cancel is hidden. A busy flag plus ignoring stale results would remove the trap.
- `submitAdd` still assigns an error for the URL that was in flight even if the user edited it meanwhile (fields stay editable during `formBusy`); the new clear-on-input only fires on later keystrokes.
- Reopen-scope failure remains non-cancelable by design: a user who removes biometrics after enabling the lock can only retry.
- Board note: 1159 `depends_on: 1162`, so it cannot close until the human discovery pass; the report's "1162 depends on 1159" is inverted.
- Round-1 findings verify fixed: server-scope failure offers Cancel, retry replays the original server, and main is merged. Report source `b96c337` matches HEAD `5c83447` apart from bookkeeping; its generated summary is against the pre-merge base, so it lists ~60 files while the branch diff is 12.

## Suggestions
- Extend tests past the two pure helpers (mount `App.vue` with `@capacitor/app`/lock mocked); today's tests pass even if `retryLock` never reopened the server.
- Recapture Settings/themes after the merge, or label them pre-merge in the task notes.
- No new bare `node`/`npm`/`npx` in the diff; the dark status-bar defect is properly carried by #1166 with its screenshot.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


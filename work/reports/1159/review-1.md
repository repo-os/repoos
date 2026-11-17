---
task: "1159"
pass: 1
at: "2026-11-17T18:24:30.373Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-android-hub-app-on-the-p
state: ok
tree_identity: "8ca4de78e:"
---
## Verdict
needs some work — merge main first (`mobile/src/App.vue` conflicts); the new lock gate traps server-scope failures and drops the pending server tap.

## Relevance
still relevant — the Android Hub still needs a real end-to-end pass; nothing on main supersedes this QA work, though main has since added dev-update UI.

## Evidence
None

## Bugs
- **Class: lock gate context loss** — `mobile/src/App.vue`: `gateLock(_serverId)` drives one full-screen `LockOverlay` for both the reopen gate and the per-server gate, and `retryLock()` calls `gateLock(null)` and discards the result. With lock scope `server`, a rejected authentication now leaves the opaque overlay over the picker with no cancel (back is `ignore`d in `back-navigation.ts`), and a later successful "Try again" closes it without opening the server the user tapped. Pass the gate context/pending action through: return to the picker on a server-scope rejection (or offer Cancel), and replay the pending open after a successful retry.
- **Class: branch integration** — `mobile/src/App.vue` conflicts with `main` (server preflight). Main's dev-updates import/handler edits overlap this branch's hunks in the import list and `onMounted`/Settings blocks. Merge `main` in (`repoos sync 1159`), keep both sides, rebuild and re-request review.

No further findings of this class were found after grepping: `App.vue` gateLock callers (`onMounted`, `onSelect`), `LockOverlay.vue`, `lock.ts`/`lock-state.ts`, `back-navigation.ts` `lockOpen`, `AddServerView.vue`, `app-state.ts`, and the `mobile-*.test.ts` files.

## Edge cases
- Server-scope failure is unrecoverable in-session on a device with no enrolled biometrics: every server tap fails and nothing clears the overlay until relaunch (same class as above).
- The URL error clears on any non-blank URL input but does not return when the field is blanked again; acceptable, though the same treatment isn't applied to Display name.
- After syncing main, Settings gains the dev-updates section; the 16 theme captures in this task predate it, so re-check theme contrast/overflow there.
- Live tailnet discovery rows remain unverified (follow-up #1162, human/held) and are correctly not claimed.
- Report source `b44a808` tree `cac58ff` matches the reviewed implementation; only bookkeeping changed since.

## Suggestions
- Add a component-level test for the `App.vue` wiring; the new tests only exercise the two pure helpers.
- Captures spot-checked (picker, Add server, discovery, Settings, Gruvbox/Jelly/Hypercolor light+dark, server open, both lock states) are legible and match their labels; no blank captures found.
- No new bare `node`/`npm`/`npx` invocations appear in the diff.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


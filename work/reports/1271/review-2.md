---
task: "1271"
pass: 2
at: "2026-11-20T13:28:38.205Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-projects-switcher-and-server-pic
state: ok
tree_identity: "30b54f0a8:"
---
## Verdict

`needs some work` — The sheet focus fix and viewport additions are correct, but one sibling instance of the modal-focus class remains unfixed in `mobile/src/App.vue`.

## Relevance

`still relevant` — The picker-flow QA premise holds; mapping "projects switcher" to the mobile server picker is reasonable since the web TopBar chip is not a switcher.

## Evidence

None

## Bugs

- **Class: modal without keyboard focus management** — `mobile/src/App.vue:365-384`, the dev-build update dialog (`role="dialog"` `aria-modal="true"` inside `.update-backdrop`) has the exact gap this task fixed in `BottomSheet.vue`: no focus moved in on open, Escape does nothing, Tab can reach the page behind the scrim. It is gated on `updateConfig.enabled` (the app-update prompt), so it is user-facing on enabled builds, not dead code. The engineer identified it and deferred it; the task's acceptance criterion ("fixed, covering the whole class") requires fixing it too — smallest fix is applying the same focus-in/Escape/focus-return handling (or reusing the BottomSheet pattern).

`No further findings of this class were found after grepping: mobile/src (all `role="dialog"` and all `Teleport` usages — BottomSheet is the only Teleport; the update dialog is the only other modal), mobile/src/style.css (both `outline: none` rules: `.field input:focus` and the new `.sheet-panel:focus`), src/ui-app/tests (sibling CSS-text assertions in mobile-hub-picker-layout.test.ts), the diff for bare `node`/`npm`/`npx` (none; sweep script has a `bun` shebang and `bunx vite` instructions), and the single BottomSheet caller in App.vue.`

## Edge cases

- The Tab wrap only covers first/last/panel positions; a focusable with `tabindex="0"` or `contenteditable` inside the slot would be missed by the `FOCUSABLE` selector — no such content exists today.
- If the trigger element is removed while the sheet is open, focus return silently no-ops; acceptable.
- Rapid open/close toggling resolves benignly (the stale continuation finds `panelEl` null).
- Sweep "Checking…" reachability state is not covered by fixtures (fixture pins "Reachable") — a known, documented limitation, not a defect.
- Merge with main conflicts only in this task's own `work/1271-*.md` (server checklist WARN; close-out takes main's copy) — no source conflict.
- Report source commit `5597088` matches the reviewed tree apart from the later bookkeeping commit; the large generated change summary is against an older base and includes merged main work from other tasks, not this branch's diff.

## Could not verify (environment)

The 510/510 sweep and the one-off browser walks cannot be re-run here (they need a dev server, which review must not start). Verified from code reading plus the green gate instead.

## Suggestions

- Consider folding the update dialog into the fixed focus-management pattern rather than duplicating it inline.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


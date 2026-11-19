---
task: "1239"
pass: 1
at: "2026-11-19T18:57:38.311Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-sign-in-user-menu-and-permission
state: ok
tree_identity: "503f41595:2c6db7bea3"
---
## Verdict
needs some work — the six fixed defects hold up, but two of the fixed classes still have unfixed sibling instances in the same panel.

## Relevance
still relevant — the QA premise holds: the screens had real, user-visible defects and the tests plus QA note are worth landing.

## Evidence
None — both declared captures render their declared states on the default app target: `default-1.png` shows the OTP step with the `.login-form` highlight, `default-2.png` shows the Security tab with the styled role dropdown and `.auth-add-row` highlight; both routeMatched, zero console errors, and only bookkeeping separates the captured tree from HEAD.

## Bugs
- **Class: native confirm() on the users/permissions screen** — the fix replaced `removeUser` and the post-add invite prompt, but `AuthSettingsPanel.vue` still calls native `confirm()` three more times on the same Security screen: `unbindTelegram` (~line 200), `disconnectTelegramIntegration` (~line 217) and `reassignTelegram` (~line 244). The task's own QA note claims the users screen has no native `confirm()`; that is true only for the users rows.
- **Class: swallowed load error renders as an empty state** — the fix added `usersError` to `loadUsers`, but the same component's `loadTelegramLinks` (line 110) and `loadAudit` (line 122) still `catch { /* ignore */ }`, so an offline user sees "No Telegram accounts bound yet." / "No audit entries yet." on the same screen.
- **Class: Enter bypasses the in-flight submit guard** (minor) — `requestOtp`, `verifyOtp` and `doBootstrap` got the guard, but `addUser` in `AuthSettingsPanel.vue` (line 129) has no `adding.value` early-return, so a rapid second Enter on the email field re-POSTs the user while the first request is in flight (the Add button's `:disabled` doesn't cover the keyboard path).

No further findings of this class were found after grepping: AuthSettingsPanel.vue (all load/error/submit handlers), LoginView.vue (all three auth handlers), TopBar.vue (help-menu trigger/popover refs), ConfirmDialog.vue and the `ui/dialog` primitives (overlay layer), stores/auth.ts, api.ts, and the repo-wide native-`confirm()`/`<select>` sweep (SettingsView, TaskDrawer, TaskCard, ServiceSettings, SystemResourcePanel, TelegramSettingsPanel, TunnelDrawer, DebugPanel — untouched files, see Suggestions).

## Edge cases
- The OTP input's six-digit rule is length-only; non-digit input still costs a server attempt. Pre-existing, probably fine.
- `replyError` trusts any `error` string the server sends, including non-plain-English ones — acceptable.
- Real devices, real email delivery and real 10-minute expiry remain human-only, as the QA note records.

## Suggestions
- File a follow-up task for the remaining native `confirm()`/`<select>` instances outside this diff (SettingsView, TelegramSettingsPanel, SystemResourcePanel, TaskDrawer, TaskCard, ServiceSettings, TunnelDrawer, DebugPanel) rather than widening this task.
- The QA note's "Left as they are" section could name the three Telegram `confirm()` calls so the next pass doesn't re-discover them.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T18:55:21.949Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


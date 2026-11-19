# Sign-in, user menu and users list QA — November 2026 (#1239)

## Scope and method

Checked the sign-in form, the one-time-code step, the user menu, and the
Settings → Security users list at 375, 768 and 1280 CSS pixels.

- Headless WebKit only, against the built app served in-process with auth
  disabled (the harness default). Playwright intercepts `/api/auth/**` and
  answers from fixtures. The state of the user, the code and the lockout are
  all simulated; no account, mailbox, credential or visible browser is used.
  Addresses in the tests are placeholders (`qa-member@example.com`).
- Test: `src/ui-app/tests/sign-in-users-qa-browser.test.ts`, 43 cases: per
  width, 7 sign-in cases, 6 users-list cases and 1 user-menu case, plus one
  boot check. The touch-size checks run at 375 px only.
- Every request not listed in a scenario passes through to the real fixture
  server, so the settings page gets real config instead of a "Couldn’t load
  settings" state.

## States covered

| State | Expected plain-English result | Before | After |
| --- | --- | --- | --- |
| Wrong code (401) | "Invalid or expired code", field cleared | pass | pass |
| Expired code (401) | Same copy: the server cannot tell wrong from expired, by design | pass | pass |
| Locked out (429) | "Too many failed attempts…" with a wait instruction | pass | pass |
| Unreadable error body (502, HTML from a proxy) | Says the server answered, not "Network error" | **fail**: "Network error — try again" | pass |
| Enter with a partial code | Nothing sent; the typed digits stay | **fail**: a verify request was sent | pass |
| Offline at the status probe | Server message with a retry | pass | pass |
| Offline while sending the code | "Network error — try again" | pass | pass |
| Users list cannot load | Error with a retry, never "No users added yet." | not observed (timed out) | pass |
| Role picker | Styled dropdown, no native `<select>` | **fail**: native `<select>` | pass |
| Remove user | Shared dialog; no native `confirm()` | not observed (blocked by the select check) | pass |
| Row action touch target at 375 px | At least 44 px tall | **fail**: 22 px | pass |
| Sign-in button touch target at 375 px | At least 44 px tall | pass | pass |
| User menu Escape | Closes and returns focus to the trigger | **fail**: focus lost to `<body>` | pass |
| User menu log out | Sends the logout request | pass | pass |
| Telegram unbind and disconnect | Shared dialog; no native `confirm()` | not run at the first pass (case added in review round 1) | pass |
| Telegram links or audit log cannot load | Error with a retry, never "No Telegram accounts bound yet." / "No audit entries yet." | not run at the first pass (case added in review round 1) | pass |
| Enter pressed twice on Add user | One request | not run at the first pass (case added in review round 1) | pass; with the guard removed the test fails with two POSTs |
| Horizontal overflow | None at 375, 768, 1280 | pass | pass |

"Before" is the unchanged code, run once with the new test file. Where a
check runs several steps, a failure at an early step hides the later ones: the
remove flow sits behind the role-picker assertion, so its baseline result is
not observed. The users-load case timed out before its assertion ran. Both are
described from the code, not from a baseline run.

## Findings and fixes

1. **Partial codes were sent on Enter.** The Verify button was disabled below
   six digits, but the Enter key path skipped that check. A partial code cost a
   wrong-code attempt against the server's lockout budget. `verifyOtp` now
   requires six digits and ignores a repeat while a request is in flight.
   `requestOtp` and the bootstrap form got the same in-flight guard.
2. **Unreadable server replies were reported as network failures.** A non-JSON
   error body threw inside the handler and landed in the catch, which says
   "Network error". A new `replyError` helper reads the server's `error` field,
   or uses a fallback message when the body is not JSON.
3. **Focus was lost when the user menu closed with Escape.** The trigger had no
   `ref`, so `closeAndFocusTrigger()` had nothing to focus. Added
   `ref="userMenuTrigger"`.
4. **The role picker and confirmations were native controls.** The add-user
   row used a native `<select>`, and removing a user or sending an invite used
   `confirm()`. AGENTS.md bans both in UI. The role now uses the shared styled
   Select, and removal and invite use the shared `ConfirmDialog`.
5. **A failed users load looked like an empty list.** The load swallowed its
   error, so an offline user saw "No users added yet." The panel now shows
   "Couldn’t load users…" with a Try again button.
6. **Row action buttons were 22 px tall.** Below 760 px they now have a 44 px
   minimum height and 10 px horizontal padding. Desktop keeps the compact size.
7. **Telegram actions on the same screen still used native `confirm()`.**
   Unbinding, disconnecting the bot and reassigning an account now use the
   shared `ConfirmDialog`. Reassign keeps the target chosen when the dialog
   opened.
8. **Telegram links and the audit log swallowed load errors.** Both showed
   their empty state ("No Telegram accounts bound yet.", "No audit entries
   yet.") when offline. Each now shows an error with a retry. Add user also
   ignores a repeat submit while the first request is in flight.

## Left as they are

- **Expired and wrong codes share one message.** That is intentional: the
  server does not reveal whether a code exists. The copy is plain English, so
  it was kept.
- **The lockout message gives no duration.** The server window is 10 minutes.
  Changing the copy means changing server responses, and no test pins the
  wording, so it stays for a separate task if it is wanted.
- **The user menu email row has `title=` and `role="menuitem"` on a
  non-focusable span.** Both are pre-existing. Neither was touched, because
  they are outside the sign-in/users screens QA. Not filed; a follow-up task
  is worth considering.

- **Native controls elsewhere in the UI.** Found by grep of `src/ui-app/src`
  and not changed here, since they sit outside the sign-in and users screens:
  `confirm()` in `SystemResourcePanel.vue` (kill process),
  `TelegramSettingsPanel.vue` (disconnect the bot, unbind a link) and
  `TaskDrawer.vue`; native `<select>` in `DebugPanel.vue` and `TunnelDrawer.vue`
  (Run mode). A follow-up task should cover these.

## Not verified here (needs a human)

- **Real devices.** The 375/768/1280 checks are viewport emulation in headless
  WebKit. Real touch input, a physical phone and tablet, and on-screen keyboard
  behaviour were not tested.
- **Real email and real expiry.** No mailbox was used. Actual code delivery,
  the real 10-minute code expiry and the real 10-minute lockout window were
  not exercised. They need a human with an account on a live server.
- **Real sign-in.** The dev-login backdoor was not used. Routes were
  intercepted, so no credential was entered or printed.

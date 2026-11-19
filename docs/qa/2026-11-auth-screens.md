# Auth and session screen QA — November 2026

## Scope and method

Checked the login and OTP screens at 375 × 844 CSS pixels in headless WebKit,
using `just serve-noauth` from this task worktree. The server remains auth-less;
Playwright intercepted only the auth status and OTP endpoints to exercise the
screen states without an account or email provider. Entered an email, moved to
code entry, submitted an invalid/expired code, and checked the rendered error,
page width, and JavaScript page errors. A second browser pass opened the user
menu, logged out through a mocked auth endpoint, and confirmed the browser
returned to `/login` at 375px. Router-guard and Hub return contract tests cover
expired sessions and the native pairing handoff.

## Findings

- Login and OTP stayed within the viewport: document width was 375px, the card
  was 327px wide with 24px side margins, and the OTP action row fit its 273px
  content width. No horizontal overflow was observed.
- Submitting the invalid/expired code displayed “Invalid or expired code”. The
  message was visible but had no live announcement semantics. Error messages
  now use `role="alert"`, and the administrator email, sign-in email, and
  one-time-code inputs now have explicit accessible names.
- Log out returned the browser to `/login`; the login screen stayed within the
  375px viewport. As the backing server is intentionally auth-less, that pass
  mocked auth status, current-user, and logout responses. The dashboard also
  attempted other auth-protected data requests during startup; those do not
  affect the logout result.
- The Hub pairing/return-to-picker flow is native-shell navigation rather than
  a standalone web pairing page. The existing Hub contract tests cover context
  preservation, token validation, expiry/login return affordance, and the
  native browser dismissal action; this pass did not use a physical device.

## Regression coverage

`src/ui-app/tests/auth-login-accessibility.test.ts` verifies accessible names
for all three login-flow inputs and alert semantics for both bootstrap and
sign-in errors. `router-guard.test.ts` and `mobile-hub-return.test.ts` were run
alongside it. All 34 tests across those three files passed.

The managed preview disables auth, so `/login` normally redirects to the
dashboard during handoff capture. Preview-only `auth:login` and `auth:otp`
fixtures now let declared 375px captures render the actual login component;
regular auth-disabled navigation still redirects as before.

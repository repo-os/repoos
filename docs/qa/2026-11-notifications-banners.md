# Notifications, toasts and error banners — November 2026

## Scope and method

This pass focused on the shared toast surface because it is the app-wide path for transient success, informational and error messages. The notifications preference store and numerous page-level error banners already have specialized behavior and were not changed in this pass. The app was served from this task worktree with `just serve-noauth 7382` (port 7272 was already occupied) and loaded in headless Playwright at a 390 × 844 viewport. The rendered app title was RepoOS, the page shell and dashboard content appeared, and the browser reported no uncaught page exceptions. No visible browser or user Chrome session was opened.

The UI build completed. Focused Vitest coverage ran for the new ToastPanel accessibility regression and the Repo store tests: 74 tests passed across three files, including the store's duplicate suppression, dismissal, timeout, and error handling cases.

## Finding and disposition

| Finding | Impact | Disposition |
| --- | --- | --- |
| The toast stack used `aria-live="assertive"` with `aria-atomic="true"` on the entire list. | A new toast or dismissal could cause assistive technology to interrupt the user and announce the full remaining stack again. The close button was only named “Dismiss”, which did not identify which message would be removed. | Changed the stack to a named, polite, non-atomic notifications region. Individual errors use `role="alert"`; success and info messages use `role="status"`. Each dismiss button now includes its toast message in its accessible name. Added a component regression test for these semantics. |

## Browser observations and limits

The headless browser confirmed the no-auth server served the app and that the dashboard mounted without page-level exceptions. No user-facing action was taken to force an error or success toast in the live app, so the interactive dismiss and auto-expiry were not manually driven in this browser pass. Those behaviors remain covered by existing Repo store tests, while the new component test verifies region, per-message live roles, and the specific dismiss label. The pass did not audit every page-specific inline error banner or browser notification permission flow; those surfaces were outside this targeted correction.

## Verification

- `bun run build:ui` — passed.
- Headless Playwright against `http://127.0.0.1:7382` — app title and dashboard content rendered; zero page exceptions.
- `bun run test -- src/ui-app/tests/toast-panel-a11y.test.ts src/ui-app/tests/repo-store.test.ts` — 74 tests passed (the repository test wrapper also ran its isolated boot-timing file).
- `REPOOS_CHECK_CHANGED=main repoos check` — passed. Remote changed-path validation, format, lint, build, CSS and contrast guards, branch-artifact guard, and UI smoke passed; unrelated steps were skipped by path filters.

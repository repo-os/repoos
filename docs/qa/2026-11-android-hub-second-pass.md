# Android Hub second-pass QA — November 2026

Task #1182. Browser fixture QA for the Android Hub in `mobile/`, run at 360 × 812 and 412 × 812 CSS pixels. The pass covers server list and offline fixtures, settings and lock controls, add-server validation, edit-server sheet layout, and long unbroken content. This is browser evidence only; no Android device or native WebView was used.

## Setup and method

The app was served with `bunx vite --port 5188` from `mobile/`. The first start happened before mobile dependencies were installed and Vite could not resolve Capacitor imports. Installing the app's declared dependencies with `bun install` and restarting Vite resolved that setup issue. The persistent sweep is `mobile/scripts/fixture-qa.ts`; it now runs its fixture checks at both requested viewport widths and exercises the settings lock toggle, edit sheet with a long saved URL, and invalid-HTTP add-form submission at both widths.

The sweep uses Playwright Chromium at device scale factor 2. It checks element bounding boxes against the viewport and checks that selected text containers do not have horizontal scroll overflow. It records page and console errors for each initial fixture. This is a useful regression check for clipping and wrapping, not a substitute for touch behavior or native system UI.

## Results

The fixture matrix passed at both widths: `many`, `one`, `empty`, `unreachable`, `settings`, `add`, and `discover`. No element bounds crossed the viewport and no page or console errors were recorded on those initial fixture loads.

At both widths, ensuring Device lock was enabled revealed its scope selector and the settings screen remained within the viewport. The check reads `aria-checked` and only toggles if needed, so it handles the saved setting without flipping it off on a later width. The browser environment reports a supported native biometric plugin interface, so the unsupported-device warning does not appear there. That absence is expected for this fixture environment and is not evidence that device authentication works.

The lock screen is exercised with the browser-only `?fixture=lock&auth=failure&platform=android` state. The overlay and lock card stayed within bounds at 360px and 412px. Pressing **Try again** with the failure result kept the overlay open; switching the fixture response to success and retrying closed it at both widths. This verifies the Hub overlay state transitions in Chromium. It does not validate the Android biometric prompt itself.

Fixtures are guarded by Vite's `import.meta.env.DEV`; the bundler replaces this flag with `false` for production builds. The production regression script checks `?fixture=lock&auth=success&platform=android` against the built preview and confirms the regular empty server state remains, proving the query neither seeds fixture servers nor skips production authentication. To repeat the production check, run `bun run build`, start `bunx vite preview --port 5189` in `mobile/`, then run `QA_BASE_URL=http://localhost:5189 bun scripts/production-fixture-guard-qa.ts`.

The edit-server bottom sheet was opened from the server-list fixture with a deliberately long path URL. Its URL hint wrapped with zero measured horizontal overflow at 360px and 412px, and the sheet remained within the viewport. The add-server flow was submitted with `http://insecure.example.test`; the HTTPS validation error fit its text box and the form remained in bounds at both widths.

The offline/failure fixture (`unreachable`) rendered in bounds at both widths. The discovery fixture's expanded failure row was checked with a 120-character unbroken reason. A long discovery message and warning were inserted using their real CSS classes, and the dev-update dialog was represented with its real shell classes and an unbroken commit note. All four text containers wrapped without measured overflow. The 85-character picker name and long URL case also remained in bounds.

The final sweep reported 55 checks, all passing. The separate long-path and no-breakpoint URL checks passed, including the 360px and 412px edit-sheet runs. `bun run build` passed the mobile typecheck and production Vite build. `REPOOS_CHECK_CHANGED=main repoos check` also passed its remote scoped build and tests, formatting and lint, branch-artifact guard, and UI smoke test.

## Findings and changes

No product layout defect was reproduced in these flows at 360px or 412px, so no CSS behavior was changed. The useful change from this pass is that the existing fixture sweep now covers both requested widths, instead of the prior 375px-only baseline. It also deterministically clears persisted lock settings before exercising the lock toggle. That makes the acceptance checks repeatable and guards against a prior run changing the starting state.

The sweep's existing checks were retained: long server name and URL, path and unbroken URL wrapping in the edit sheet, invalid HTTP validation, discovery failure reason/message/warning wrapping, dev-update note wrapping, and clean initial fixture loads. The QA remains intentionally browser based: there is no test claim about Android system back behavior, keyboard resizing, biometric prompts, actual network reachability, or device-specific safe-area insets.

## Follow-up boundary

A real-device pass remains necessary to confirm the Android WebView and biometric prompt. The current work establishes that the requested web UI states fit at the two viewport widths in Chromium. It does not establish interaction or rendering behavior on physical Android hardware.

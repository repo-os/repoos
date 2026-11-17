---
task: "1166"
pass: 1
at: "2026-11-17T19:15:49.591Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/fix-android-16-hub-status-bar-contrast-a
state: ok
tree_identity: "62233c6f5:"
---
## Verdict
`back to the drawing board` — the added attribute is a no-op; the light strip is the window background, so Dark stays unreadable.

## Relevance
`still relevant` — the #1159 captures show a real, unfixed contrast bug and nothing on main addresses the Hub's status-bar surface.

## Evidence
None

## Bugs
- **Class: ineffective fix (wrong platform layer)** — `mobile/android/app/src/main/res/values/styles.xml:20`: `android:enforceStatusBarContrast` only controls a system scrim over a *transparent* bar. AOSP `PhoneWindow` already reads it with default **false** for targetSdk ≥ 29, and the setter is deprecated at API 35, so setting false changes nothing. The strip in the evidence PNGs is the activity window background: rows 0–132 are uniformly (250,250,250) = AppCompat light `colorBackground`, and WebView content starts at row 133. Nothing in the diff changes that surface, so Dark appearance keeps #FAFAFA behind white icons.
- **Class: status-bar surface follows system mode, not Hub appearance** — `mobile/src/theme.ts:31` still calls `StatusBar.setBackgroundColor`, which `@capacitor/status-bar` 8.0.3 no-ops on API ≥ 36 (`shouldSetStatusBarColor` returns false), while `AppTheme.NoActionBar` inherits `Theme.AppCompat.DayNight`, so the window background tracks Android's dark mode. The mirror case (system Dark + Hub Light → dark strip with dark icons) is the same class. The diff touches neither; the report's premise that "the web content already paints its active theme surface beneath the system bar" is contradicted by the evidence images.

No further findings of this class were found after grepping: styles.xml, AndroidManifest.xml, variables.gradle, MainActivity.java, mobile/src/theme.ts, app-state.ts, style.css, index.html, and the launch theme / `enforceNavigationBarContrast` siblings.

## Edge cases
- System Dark + Hub Light mirrors the bug (dark strip, dark icons); there is no `values-night`, and the theme follows the system, not the Hub setting.
- `android:enforceNavigationBarContrast` defaults true; check the gesture-nav strip if the same layer is used.
- The 133 px gap is the window background, so `env(safe-area-inset-top)` is 0 here; don't "fix" it with more CSS inset.
- No API 36 Light/Dark screenshots were captured for this branch (an acceptance criterion).

## Suggestions
Make the native window/status-bar surface follow the resolved Hub appearance (pass `themeColorFor(design, appearance)` to a native hook, or draw the WebView behind the bar with correct insets), then capture both appearances on the emulator.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


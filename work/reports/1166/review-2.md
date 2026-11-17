---
task: "1166"
pass: 2
at: "2026-11-17T19:26:54.949Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/fix-android-16-hub-status-bar-contrast-a
state: ok
tree_identity: "d2b1b901b:"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: the bridge targets the right native surface, but no API 36 Light/Dark captures exist yet.

## Relevance
`still relevant` — the #1159 captures show a real pale strip in Dark appearance, and nothing on `main` changes the Hub's status-bar surface.

## Evidence
- API 36 emulator, Hub **Light** appearance — not captured (acceptance criterion 4).
- API 36 emulator, Hub **Dark** appearance — not captured; only the #1159 "before" images exist.
- Cross-mode combos (system Light + Hub Dark, system Dark + Hub Light) — not captured.

## Bugs
None found

No further findings of this class were found after grepping: styles.xml, AndroidManifest.xml, colors.xml, MainActivity.java, HubDevUpdateConfigPlugin.java, theme.ts, theme-core.ts, app-state.ts, index.html, style.css, capacitor.config.ts, variables.gradle, mobile-hub-shell.test.ts, and Capacitor's StatusBar.java / BridgeActivity.java.

## Edge cases
- **Startup fallback** assumes dark, but the default appearance is `system`; on a light-system launch the strip is `#070a12` with DayNight dark icons until `syncNativeChrome` runs. A `values-night/colors.xml` (light in `values`) would make the first frame follow the system.
- **Error isolation** in `syncNativeChrome`: `HubSystemChrome` is awaited before `StatusBar.setStyle` inside one `try`, so a bridge rejection also skips icon polarity — the contrast fix itself. Set the style first or give each call its own `try`.
- **`system` appearance at runtime** isn't re-synced when the OS toggles (pre-existing); the window and WebView both keep the old color, so they stay consistent but stale.
- The **navigation-bar strip** in the #1159 captures is pale too; the window-background change should cover it if it is the same surface — confirm in the same capture.
- The nav-bar/status-bar geometry still leaves content below the bars; the change touches no layout, so no overlap regression.

## Suggestions
- Attach API 36 emulator captures for Light and Dark (plus both mismatch combos) showing icons, the strip color, and the top-bar inset. #1162 is held and scoped to tailnet discovery, so it is not a substitute.
- Consider `--panel-solid` (top-bar color) for the strip to avoid the faint seam with `--bg`.
- Reject non-hex input defensively in the plugin if other callers are added later; today's palette is safe.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


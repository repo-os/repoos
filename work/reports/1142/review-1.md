---
task: "1142"
pass: 1
at: "2026-11-16T14:13:56.217Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/android-hub-system-back-gesture-should-r
state: ok
tree_identity: "96a89ed49:"
---
## Verdict
good to go — the Android back mapping is correct, platform-gated, and covered; no code defects found.

## Relevance
still relevant — the Hub shell still uses local Vue routes with no native back handling, and nothing newer on `main` addresses this.

## Evidence
None — `shots: skipped` is correct for this mobile-shell diff; no UI capture target exists.

## Bugs
None found

No further findings of this class were found after grepping: `App.vue` route/sheet/lock state and teardown, `installHubBackButton` call sites, iOS/web gating, `src/ui-app/vite.config.ts` test include, `docs/mobile-architecture.md`, and `mobile/android/capacitor.settings.gradle` / `capacitor.build.gradle` (`@capacitor/app` is synced).

## Edge cases
- Real-device gesture is unobserved (runner has no Android device), as the task notes require; a human with the phone should confirm signed-out discovery → picker.
- Startup ordering: `await installHubBackButton(...)` is the first statement in `onMounted`. A rejected `App.addListener` would skip `init()`, fixture routing, discovery and the reopen lock gate. The plugin is present natively, so risk is low, but a `try/catch` would keep startup alive.
- Signed-out, loading, empty and errored discovery all resolve to route `discover` (`app-state.ts`), so the single `show-picker` branch does cover the acceptance criterion.
- A second quick back press on discovery exits the app (now on picker root); standard Android, but the only exit path introduced.
- The full-screen in-app browser uses its own activity, so its hardware back should be unaffected; worth a manual check with a server open.

## Could not verify (environment)
- Landing preflight is blocked by an untracked `.codex-attachments/...png` on `main`; board state, not code. The only merge conflict is this task's own `work/1142-*.md`, which close-out resolves from `main`.

## Suggestions
- Wrap listener registration in `try/catch` so a native failure cannot abort the rest of `onMounted`.
- The four per-state discovery tests assert the same `HubBackState` (the `it.each` label is unused); acceptable, but naming the real view state would make the "signed-out/error" claim less abstract.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


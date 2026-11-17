---
task: "1152"
pass: 2
at: "2026-11-17T08:04:56.944Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/mobile-hub-return-to-server-picker-from-
state: ok
tree_identity: "3b057d76d:1d0d39f0ff"
---
## Verdict
`good to go` — STALE-EVIDENCE-ONLY: the code is sound; the recorded handoff captures predate the reviewed HEAD (no code defects found).

## Relevance
`still relevant` — main still hides the phone project name and has no one-action Hub return (#1142 only covers Android back); nothing has superseded this.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `src/core/hub-return.ts`, `src/ui-app/src/lib/hub-shell.ts`, `mobile/src/browser.ts`, `src/server/routes/ui.ts` + `server.ts` (route and PUBLIC_PATHS registration), `TopBar.vue`, `LoginView.vue`, `RepoLogoMark.vue`, `SearchBar.vue`, `style.css` narrow block (all five added rules: `.topbar`, `.spacer`, `.search-wrap`, `.search-input`, `.preview-build-banner` — base rules all earlier or beaten by specificity), `main.ts`, both fallback branches (landing page and `blob:`), the three mobile imports of `../../core/hub-return.js`, and the diff for new `node`/`npm`/`npx` (none).

## Edge cases
- Round-1 findings verified fixed: scoped `.topbar .preview-build-banner` (present in `dist/ui/assets/index-Bpry2RGH.css`), login affordance, offline probe+blob fallback, `-6px` logo margin, effect-level unit test.
- Fullscreen routes (`/tasks/:id/diff`, `/client-board`) render no `TopBar`, so no logo there; #1151 owns that back control.
- A crafted `/work?repoos_hub=<32 hex>` link in a normal browser makes the logo a one-way trip to the "Returning to RepoOS Hub…" page (harmless, but odd).
- The `blob:` navigation event is unproven on a real Android/iOS WebView; if the shell ignores it the user sees the fallback page with a "Back to the server" link (no worse than today).
- Login-redirect path leaves the token in the URL until the post-login navigation; `sessionStorage` covers the normal path.

## Suggestions
- Re-capture on HEAD 68a27bc: `default-1.png-1/-2` (mobile + desktop, tree 1d0d39f0f) are the stale handoff record. The newer `default-1.png-4/-5/-6` (360 dark, 390 light, desktop) already show the fixed bar with the banner gone and "repo" visible.
- Add a test asserting `HUB_RETURN_PATH` stays in the auth `PUBLIC_PATHS` list (the route test calls the handler directly).
- Wrap `void returnToHubServerPicker(...)` in a `.catch` so a failed navigation is visible instead of a silent dead tap.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


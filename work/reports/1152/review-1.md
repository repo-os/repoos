---
task: "1152"
pass: 1
at: "2026-11-17T07:23:34.496Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/mobile-hub-return-to-server-picker-from-
state: ok
tree_identity: "430509578:1d0d39f0ff"
---
## Verdict
`needs some work` — the narrow-screen banner hide is dead CSS; the mobile capture shows the project name crushed to ~2 characters.

## Relevance
`still relevant` — nothing on main solves one-action return to the Hub picker (#1142 covers Android back, not this), and the phone top bar still hides the project name.

## Evidence
None

## Bugs
- **Class: CSS cascade order (narrow-screen override defeated by a later base rule)** — `src/ui-app/src/style.css:619`: `.preview-build-banner { display: none }` sits in the `@media (max-width: 719.98px)` block near line 589, but the base `.preview-build-banner { display: inline-flex; … }` is defined at line 2539 with the same specificity and later in source order. Nothing later re-hides it, so the rule never applies. Confirmed in the built stylesheet: the `display:none` occurs at byte 92,908 inside the media query and the base `inline-flex` at byte 122,479. Consequence in `default-1.png-1.png` (390×844): "Preview Build" still occupies the row and the project chip renders as roughly `re…`, so the acceptance criterion "show the current project name on narrow phone screens" is not met in the captured build. Fix by moving the hide rule after the base rule (or scoping it more specifically, e.g. `.topbar .preview-build-banner`), then re-capture the mobile shot on the final tree (and confirm at 360px).

No further findings of this class were found after grepping: the other rules in that media block (`.topbar`, `.topbar .spacer`, `.search-wrap`, `.search-input`, `.search-placeholder`, `.search-input kbd`) all have base rules earlier in the file, the `TopBar.vue` scoped media rules follow their base rules, and per-theme `.search-input { padding }` overrides only touch padding (border-box, so no overflow).

## Edge cases
- Offline/unreachable server at logo tap: the full-page navigation fails, `browserPageNavigationCompleted` never fires, and the WebView stays open.
- On `/login` (expired session) `TopBar` isn't rendered, so there is no logo affordance to reach the public landing page.
- The initial `?repoos_hub=<token>` is a query param, so it lands in server/proxy logs, unlike the fragment in the return hop (low impact — it only grants "close this view").
- Engineering report source `1d0d39f0f` matches the reviewed tree apart from task/report bookkeeping.

## Suggestions
- Add a dark-theme (and 360px) mobile top-bar capture; only a 390px light shot exists.
- The "native shell wiring" test is a regex over `mobile/src/browser.ts`; it can't catch the close/listener path regressing. Consider exporting the navigation handler for a real unit test.
- The 44px `.logo-trigger` with `margin-inline: -7px` overlaps its neighbour by ~1px at the 6px phone gap; harmless but easy to avoid.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T07:15:11.176Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


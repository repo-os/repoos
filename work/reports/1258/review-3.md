---
task: "1258"
pass: 3
at: "2026-11-20T09:31:36.526Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/mobile-polish-open-on-work-hide-page-scr
state: ok
tree_identity: "711624ae1:1dc4421246"
---
## Verdict
`needs some work` — src/ui-app/src/router.ts conflicts with main (catch-all); merge and reconcile unknown-path behavior.

## Relevance
`still relevant` — the three phone polish items remain unsolved on main and the implementation itself is sound.

## Evidence
None.

## Bugs
- **Class: catch-all route divergence (merge conflict with base)** — `src/ui-app/src/router.ts`: the branch rewrites the catch-all to `redirect: "/work"`, but main (#1252, landed 2026-11-20) replaced it with a `not-found` route rendering `NotFoundView.vue`. The server preflight confirms the file conflicts; the merge is not clean. After merging, the branch's `home-route-work.test.ts` ("sends an unknown path to Work"), the QA note ("unknown paths resolve to /work") and the skeleton comment contradict main's intended behavior. Resolution should keep main's NotFound page for unknown paths, keep `/` → `/work` from this branch, and update the test, QA note and test-file header comment to match.

Prior pass 2 findings are verified fixed on HEAD: `mobile-touch-affordances.test.ts` now asserts the token pattern and `shot-targets.ts` registers `/control`; the `live-reconnect-qa-browser.test.ts` failure (navigating `/` for the Control dashboard) is fixed by the committed `/control` navigation.

No further findings of this class were found after grepping: `APP_ROUTE_PREFIXES`/`shot-target-support-0866.test.ts`, `LOADING_SKELETON_ROUTES` consumers, nav/skeleton/MobileTabs registrations, PWA `start_url` (`/work`, correct), `src/ui-app/src` and `docs/`+`user-docs/` for `/`-as-home references, `NotFound`/catch-all references in tests, and remaining 30px/44px header overrides (`logo-trigger` visual vs hit area, `notice-pop-action`, `.search-wrap`).

## Edge cases
- Hidden scrollbar rule is scoped to `.main > :not(.spin)` under 719.98px; `scrollbar-width: none` / webkit `display:none` don't block touch or keyboard scrolling; desktop untouched. Fine.
- `--topbar-control-h` inherits correctly into the scoped TopBar/NoticeBell styles; the 900px block grows all six controls together. Fine.
- Real Android device / Hub shell touch feel remains unverified — honestly declared in the QA note.
- Handoff's remote `ui-smoke` console errors (fonts/manifest on an offline host) are environmental, not this diff.

## Suggestions
- The single declared shot (`default`, `/work`, highlight `.topbar`) is STALE for HEAD 711624ae1 and its PNG shows the board loading skeleton rather than the populated Work Queue — re-capture on the final tree after the merge.
- None other.

## Verdict
needs some work — merge main into the branch, resolve `router.ts` keeping NotFound for unknown paths, update the affected test/QA note, then re-request review.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T00:36:47.624Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


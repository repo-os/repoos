---
task: "1226"
pass: 1
at: "2026-11-19T15:28:18.165Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-slow-network-and-offline-behavio
state: ok
tree_identity: "ac9479f1a:55445a8ce4"
---
## Verdict
`needs some work` — one sibling site of the new banner-retraction invariant doesn't apply it; everything else checks out.

## Relevance
`still relevant` — the four surfaces genuinely needed the slow/offline pass, the three fixes are real, and the QA doc plus tests land the acceptance criteria.

## Evidence
None — both declared captures were verified: route matched, no console errors, and the PNGs really show the Settings and Agents `.page-load-error` panels with Retry (not blank, not stale — capture tree matches reviewed HEAD apart from bookkeeping).

## Bugs
- **Class: recovery-banner retraction gap** — `src/ui-app/src/stores/repo.ts:2663`. Fix 2's invariant is "the moment the stream is demonstrably back, the offline banner clears," but it is applied only at the `onopen` path (line 2563). The per-event frame handler (2661–2669) also marks the stream demonstrably up — `markStreamHealthy(); // a frame arrived — the stream is demonstrably up` — yet never calls `clearOfflineOnStreamBack()`. The offline banner can also be raised while the SSE stream stays alive: any `api()` timeout dispatches the event App.vue's `onApiTimeout` (line 58) feeds to `showOffline`. In that state frames keep arriving and the board keeps updating under a banner claiming the server is down until the user focuses or navigates — the exact "page contradicts itself" state the fix set out to eliminate. Clearing on frames is strictly safe: `clearOfflineOnStreamBack` is already a no-op for stale banners and while a manual reload is in flight.

No further findings of this class were found after grepping: repo.ts `markStreamHealthy` call sites (2559, 2663), uiRecovery `showOffline`/`checkUiBuild` callers, App.vue `onApiTimeout`, all other `PageSkeleton` views (Checks/Deployments/Dev/Releases/Secrets use `loading && !result` bindings that resolve in `finally`), remaining `.agents-load-error` references, other boot-gating fetches (router.ts:88 and App.vue:101 both route through the now-bounded `loadMe`), and test/docs registrations of the renamed class.

## Edge cases
- `LoginView.checkStatus` does its own unbounded `fetch("/api/auth/status")` and `/api/auth/me` with no signal; a stall leaves the login page's spinner until the browser's default timeout. Same unbounded-fetch class, explicitly declared out of scope in the QA doc — worth a follow-up ticket rather than blocking this pass.
- In the new browser suite, if `launchWebkit` throws after `startPreviewServer` succeeded, `afterAll` returns early without closing the in-process server (process-exit bound; failure path only).
- Settings Retry calls `config.load()`, which clears `error` up front, so the panel briefly swaps back to the skeleton while retrying; acceptable, just noting the flash.

## Suggestions
- Duplicate comment in `offline-slow-network-browser.test.ts` ("Everything boots fine; only per-task endpoints fail." appears twice in the 500-drawer test).
- Apostrophe inconsistency across the two panels: Settings uses straight "Couldn't load settings", Agents curly "Couldn’t load agents"; the captures show both.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T15:25:15.884Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


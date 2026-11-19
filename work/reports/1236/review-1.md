---
task: "1236"
pass: 1
at: "2026-11-19T17:31:03.749Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/easter-eggs-bundle-bound-loginview-auth-
state: ok
tree_identity: "b438c4037:37a24b6646"
---
## Verdict

`good to go` — the login page's auth fetches are bounded with the #1226 pattern, tests cover slow/500/offline, and the capture is current and clean.

## Relevance

`still relevant` — #1226 explicitly scoped login screens out, and `LoginView` was the last unbounded fetch path; the premise holds.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `src/ui-app/src/views/LoginView.vue` (only one raw `fetch(` remains — inside `fetchBounded` itself; all seven call sites — status, health, me, request-otp, verify-otp, bootstrap-admin — go through the bound), `src/ui-app/tests/login-view-bounded-auth.test.ts`, `src/ui-app/tests/offline-slow-network-browser.test.ts`, `src/ui-app/src/api.ts` (`SERVER_UNREACHABLE_MESSAGE` import resolves), `stores/auth.ts` and `lib/hub-shell.ts` (sibling #1226 bindings unchanged), and the diff has no `node`/`npm`/`npx` invocations.

## Edge cases

- 200-with-non-JSON body from `/api/auth/status` → `res.json()` throws → error state with retry. Covered.
- `/api/auth/me` answers non-OK (401) → falls through to the usable sign-in form, not an error. Correct.
- `auth.loadMe()` throwing after `me` says authenticated → outer catch shows the error state with retry; user is not stranded.
- Re-entrancy: focus handler guards on `!loading && statusError`, so a focus event during an in-flight probe does not double-fire; listener removed in `onUnmounted` (no leak). A click-retry racing a focus retry could double-probe once, but both runs converge on the same state — harmless.
- Shot-fixture path: a stalled `/api/health` probe now shows the error state instead of silently redirecting — bounded, deliberate, and only reachable with `shotState` set.
- POST timeouts surface through the existing plain-English `errorMsg` catches; "Sending…" cannot hang forever.

## Suggestions

- The 6 s bound is now duplicated in three places (`stores/auth.ts`, `lib/hub-shell.ts`, `LoginView.vue`); extract a shared `fetchWithTimeout` if a fourth caller appears, as the engineer's report itself notes.
- The capture (tree 37a24b66 vs reviewed HEAD b438c40) is current — only task bookkeeping changed in between; the PNG shows the sign-in form with the `.login-form` highlight, matching the declared shot.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T17:29:43.726Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


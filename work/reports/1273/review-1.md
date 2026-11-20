---
task: "1273"
pass: 1
at: "2026-11-20T13:29:18.466Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-login-lock-screen-and-session-ex
state: ok
tree_identity: "6f1eafea8:df4529ec4f"
---
## Verdict
`good to go` — the diff is small, correct and well-tested; captures match the reviewed tree.

## Relevance
`still relevant` — sign-in/session-expiry QA was not solved by other work; the redirect gap and login UX issues are real and now fixed.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: server 401 senders (`server.ts` gate, `auth.ts` requireAdmin, `hub.ts`, `telegram-identity.ts`, `project-environments.ts`), client 401 handlers (`SecretsView.vue`), other redirect sites (`hub-shell.ts`, `googleLogin`), `window`/`location` guards in `api.ts`, `btn-spinner`/`ring` CSS, `shot-preview-fixtures` (`auth:login`/`auth:otp`), and the notifications QA fixture routes.

## Edge cases
- **SSE doesn't join the redirect:** `EventSource` (`/api/events`, repo store, `AgentsView`) on an expired session just errors and reconnects; the page leaves only when an `api()` call fires. Harmless today (the reconnect banner exists, and any interaction triggers `api()`), but it is the sibling path of this class.
- **Google-only auth:** the `?expired=1` notice renders only inside the `hasEmailProvider` branch, so a visitor bounced from a Google-only server gets no explanation of why they're on the login page.
- **SecretsView's own 401 message** ("Sign in to view project environments…") now competes with the global redirect; the redirect wins and the local message is dead code on that path, not broken.
- **Concurrent 401s** each call `location.assign` — idempotent, same URL, no loop (guarded by the `/login` pathname check).
- The `redirect` query param is consumed verbatim by `router.replace` (pre-existing pattern, unchanged here).

## Suggestions
- Move the `sessionExpired` notice out of the `hasEmailProvider` block so it shows on any sign-in surface.

Checked against the spec: headless-WebKit QA at 375/768/1280 exists and covers every login state, tap targets, focus ring, error-state clearing and the expiry notice; the #1249 fixture gap is fixed without weakening assertions; the `window`→`location` fix is the only such guard of its kind; no `node`/`npm`/`npx` additions; no `repoos.toml` changes. Both captures (read as PNGs) render the declared states — highlighted `.login-actions` with 44px links on the code step, and the focus ring on `.login-input` — with zero console errors, and the capture tree (`df4529ec4f`) differs from HEAD only by report/task bookkeeping.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T13:26:30.636Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


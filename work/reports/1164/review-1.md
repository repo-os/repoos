---
task: "1164"
pass: 1
at: "2026-11-18T00:30:23.418Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/verify-secrets-page-behavior-with-authen
state: ok
tree_identity: "649a4d5ab:d9b8550b35"
---
## Verdict
`needs some work` — unsigned 401 still shows the create-environment CTA and raw “Authentication required”; the 401 state has no capture.

## Relevance
`still relevant` — main has no 401 guidance on the Secrets page, and the sibling #1165 fix only touched Agents.

## Evidence
None

## Bugs

- **Class: 401 state not gated** — `src/ui-app/src/views/SecretsView.vue:519-540`: a 401 sets `error` and leaves `environments` empty, so the sign-in alert renders *together with* `.secrets-empty` (“Give this project an environment” + “Create environment”). The unsigned user is invited to run a flow that cannot succeed, and the header’s New-environment button is hidden by `canManage`, so the two affordances disagree.
- **Class: 401 handling bypass in mutation errors** — same file, `createEnvironment` (`:384`, `createError = e instanceof ApiError ? e.message : safeError(e)`) and `openEnvInEditor` (`:244`, toast from `err.message`) still surface raw `ApiError.message`. On 401 that is the server body “Authentication required”, not the new fixed sign-in copy — the same class on the fallback side of the new branch, and it contradicts the report’s “don’t reflect server bodies” rationale.

No further findings of this class were found after grepping: `loadEnvironments`, `loadSnapshot`/refresh, `saveKey`, `removeKey`, all `safeError` callers, all `.message` reads in SecretsView, `ApiError` handling in `src/ui-app/src`, and the 401/403 branches in `src/server/routes/project-environments.ts`.

## Edge cases

- Warm cache + 401 puts the message in `snapshotRefreshError` (“Refresh failed: Sign in…”) while the stale ledger stays; values are still masked, but confirm that reads acceptably.
- The new test rejects every request, so no snapshot/key ever exists: the “no `DATABASE_URL` / `FAKE_SECRET_VALUE`” assertions are vacuous, and the real 401 body is “Authentication required”, not the test’s “Unauthorized”.

## Suggestions

- The one capture uses the `secrets:populated` fixture, which bypasses `/api/project-environments`, so it is not evidence of signed-in server access, and the changed 401 copy is uncaptured. Add a `secrets:unauthorized` shot fixture if the human wants visual proof of the unsigned state.
- Extend the regression test to assert the empty-state CTA is absent on 401, and use the real server 401 text.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T00:26:57.025Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


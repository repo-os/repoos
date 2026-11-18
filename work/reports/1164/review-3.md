---
task: "1164"
pass: 3
at: "2026-11-18T01:22:28.161Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/verify-secrets-page-behavior-with-authen
state: ok
tree_identity: "5316b9dd0:d741472e21"
---
## Verdict
`needs some work` — unsigned 401 state is uncaptured (only shot stale); a stale sign-in error returns in the create dialog.

## Relevance
`still relevant` — main's SecretsView still has no 401 handling, so the unsigned state this branch fixes remains broken there.

## Evidence
None

## Bugs
- **Class: 401 state cleanup** — `src/ui-app/src/views/SecretsView.vue:421` (with `safeError` at `:383-385`): a 401 from `createEnvironment` runs `mutationError` → `safeError`, which clears `createError` and closes the dialog, then the catch reassigns the returned sign-in string to `createError`. If Reload re-authenticates in the same page instance, “New environment” opens the dialog showing “Sign in to view project environments and keys.” while signed in. Clear `createError` when opening the dialog (or don't reassign it for 401) and add a reopen-after-recovery test; the current 401 create test never reopens it.

No further findings of this class were found after grepping: all `api()` calls/catches in SecretsView (`loadEnvironments`, `loadSnapshot`, `saveKey`, `removeKey`, `createEnvironment`, `openEnvInEditor`), every `safeError`/`mutationError` caller, `confirmKey`/`createOpen`/`addOpen`/`editingKey`/draft/`message` state, `refreshPageData`/`invalidatePageData(Prefix)` semantics, the 401/403 branches in `src/server/routes/project-environments.ts`, the new fixture registration in `src/core/shot-fixtures.ts` and `shot-preview-fixtures.ts`, and the new Secrets tests.

## Edge cases
- The sole capture is STALE (`sourceIdentity d741472e`, `shots.json 74c0c70f6`, reviewed HEAD `5316b9dd0`) and shows the static `secrets:populated` fixture. The branch adds `secrets:unauthorized` but declares no shot for it, so AC2 has component-test proof but no visual proof of the changed state.
- Round-3 code has no engineering report; the posted round-2 report is for `d741472e`.
- AC1's signed-in page-to-server round trip is still route-handler plus API-double coverage; no live authenticated browser pass exists (the report concedes this).
- Warm-cache 401 briefly renders cached key metadata before clearing; values never render.
- `authRequired` resets only on a successful environments fetch, so recovery depends on Reload; that reload shows no skeleton, and a repeated 401 restores the alert.
- `DeploymentsView` still surfaces raw 401 text (pre-existing, untouched here).

## Suggestions
- Declare `secrets:unauthorized` (target `default`, `/secrets?shotState=secrets%3Aunauthorized`) and re-capture both shots on HEAD. The current PNG renders the populated ledger correctly, is not blank, and records zero console errors.
- Add the missing current-round engineering report for `5316b9dd0`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T00:44:34.489Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


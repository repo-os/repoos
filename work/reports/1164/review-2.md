---
task: "1164"
pass: 2
at: "2026-11-18T00:50:54.525Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/verify-secrets-page-behavior-with-authen
state: ok
tree_identity: "d741472e2:d741472e21"
---
## Verdict
`needs some work` — a 401 leaves the remove-key confirm dialog alive with stale key metadata and an enabled destructive action.

## Relevance
`still relevant` — main's Secrets page still has no 401 handling, and the landed #1165 work touched CLI/agents auth errors, not this UI.

## Evidence
None

## Bugs
- **Class: 401 state cleanup** — `src/ui-app/src/views/SecretsView.vue:465-469` (catch) with template `:723-739`: `removeKey`'s 401 goes through `safeError`, which clears `snapshot`/`environments`/`selected` but not `confirmKey`. The teleported `ConfirmDialog` therefore stays open after the sign-in alert appears, showing the key name and consumers, an empty environment (`selected` is now `""`), and an enabled “Remove key”. If the user then presses Reload, the dialog survives and can delete that key using the refreshed snapshot version. Same class, same handler family: `saveKey`'s catch leaves `addOpen`, `keyDraft`, `valueDraft` (the typed value) and `editingKey` set, so the add row/draft reappears with its old contents after a successful re-auth; the page-level `message` banner is never cleared, so a stale “KEY saved…” status renders beside the sign-in alert. No test covers `saveKey`/`removeKey` 401 (only create/editor, which pass).

No further findings of this class were found after grepping: all `safeError`/`mutationError` call sites in SecretsView, every `error.value`/`snapshotRefreshError` write, `refreshPageData`/`invalidatePageData(Prefix)` semantics, the `project-environments`/`secrets:` cache consumers, the server's 401/403 branches in `routes/project-environments.ts`, and the other UI `project-environments` caller (DeploymentsView).

## Edge cases
- AC1 (signed-in verification against the real API) is still not demonstrated: the declared shot is the `secrets:populated` fixture, which bypasses `/api/project-environments`, and the report concedes no live login/server round trip. The code path is unchanged for that case; a dev-login pass or server test would close it.
- Warm cache + expired session briefly renders cached key metadata before the 401 clears it; metadata only, never values, and it fails closed.
- `authRequired` resets only in the environments success handler, so recovery depends on the Reload button.
- `DeploymentsView` still surfaces raw `Authentication required` on a 401 (pre-existing, out of scope).

## Suggestions
- Clear `confirmKey`, `addOpen`, `editingKey`, drafts and `message` in the 401 branch and add a `removeKey` 401 test.
- Add a `secrets:unauthorized` capture so the changed copy has visual evidence.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T00:44:34.489Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


---
task: "1228"
pass: 1
at: "2026-11-19T12:56:11.566Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-cli-help-and-error-messages-matc
state: ok
tree_identity: "123050eee:3f221c4e07"
---
## Verdict

`needs some work` — one residual class: CLI sites that classify a 200 reply as success without checking the new `htmlResponse` marker, so a SPA-fallback HTML body still yields a green ✓ and exit 0.

## Relevance

`still relevant` — the drift the task targets is real (nine undocumented commands, two stale help lines), and this pass fixes it thoroughly with a drift-guard test.

## Evidence

None

## Bugs

- **Class: SPA-fallback-200 treated as success** — `src/commands/control-api.ts`: `RepoOsApi.request` now tags a non-JSON HTML body with `htmlResponse: true`, and `cmdApi` correctly exits 1 on it, but every sibling that classifies success purely by HTTP status still treats that body as success. Reachable under CLI/server version skew (a route the running server doesn't register falls through to the 200 HTML catch-all): `cmdIntegration` (~line 700) and `cmdAttention` (~line 726) print the error body via `printJson` and return 0; `cmdReview keep` (~line 488) and `cmdReview followup` (~line 522) print a green `✓ kept review verdict`/`✓ created follow-up` and return 0; `cmdVerify` (~line 797) gets the marked body from `requestOk`, treats the absent `result.ok` as success, prints `✓ evidence refreshed … at unknown HEAD`, returns 0; `cmdDone`'s cancel path (~line 852) prints `✓ <error text> (HTTP 200)` and returns 0. Centralize the check (e.g. an `isHtmlResponse()` helper or throwing in `requestOk`) instead of fixing only `cmdApi`.

No further findings of this class were found after grepping: `cmdApi`, `cmdSync`/`cmdDone` started path (`body.ok` checks — safe), `cmdReviewAgain` (checks `body.ok` — safe), all `requestOk` callers (`cmdStart`/`cmdHold`/`cmdPause`/`cmdMessage`/`cmdSendBack`/`cmdPreview`/`cmdConfig get`/remote-validation), `RepoOsApi.request`/`requestOk`/`readApiError` in `src/cli/repoos-api.ts`.

## Edge cases

- The `No valid fields to update` rewrite is keyed on the exact server string (`src/server/routes/config.ts:1007`); any server rewording silently disables it — acceptable per the engineer's rationale, but worth a server-side test pinning that string.
- `nonJsonResponse` inspects only the first 512 chars; a parse-failing body that doesn't start with `<html`/`<!doctype` still surfaces raw text (fine, but note it).

## Suggestions

- The second declared shot (control-plane table with summary/review followup/watch/allowlist) was not captured ("1 of 2 shots captured"); both target Docs site `/cli`, so one page capture likely covers it — worth re-running to confirm the table renders.
- `docs/qa/2026-11-cli-help-qa.md` finding table skips #7 (6 → 8) — cosmetic.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T12:52:49.788Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


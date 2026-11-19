---
task: "1244"
pass: 1
at: "2026-11-19T21:02:39.166Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-control-dashboard-live-updates-a
state: ok
tree_identity: "6bcc2ca02:7122d0a8fe"
---
## Verdict
`good to go` — code is sound, tests are genuine regression checks, evidence is current.

## Relevance
`still relevant` — the stale-data and stuck-banner defects are real and were not solved elsewhere; the fix lands on the shared store path.

## Evidence
None. The auto shot (`default`, route `/`) shows the healthy Control page; the committed QA PNGs (reconnecting/recovered at 375/768/1280) are non-blank and show the pill, the 0→3 count recovery and the cleared pill. Handoff console log: zero errors, and the capture tree matches the reviewed HEAD (bookkeeping-only delta).

## Bugs
None found

## Edge cases
- `boardRetryAttempt` is reset only on success, not when a retry is cancelled by a stream error or when a new open occurs — after a reconnect flap storm the first post-open retry delay starts higher than base. It still retries and converges to the cap, so not a defect, but a reset in `refreshBoardOnOpen()` (alongside `cancelBoardRetry()`) would keep backoff semantics aligned with `sseAttempt = 0` in `onopen`.
- Sibling swallowed catches in `onopen` (`refreshAutoEng`, `loadCTO`, `refreshIntegration`, `refreshGitStatus`, `fetchRunning`, `fetchQueued`) still have no retry, but each has its own backstop (focus/interval/poll) or is documented non-fatal hydration — checked, none share the board's "no later event corrects it" shape.
- The Work board was not exercised in the browser (documented residual in the QA note); it shares the same `refreshBoardOnOpen` path, so the fix applies, but its rendering was not visually verified.
- Real `repoos serve` restart, laptop sleep and half-open connections remain human residuals, honestly listed in the QA note.

## Suggestions
- Reset `boardRetryAttempt` when a reconnect open starts a new refresh, matching `sseAttempt = 0`.
- The 375 px header squeeze (project chip sliver) is a documented residual; worth a follow-up task if the chip is expected to stay readable while reconnecting.

No further findings of this class were found after grepping: `onopen`/`onerror` sibling refresh calls in `src/ui-app/src/stores/repo.ts`, all `clearOfflineOnStreamBack` call sites, `sseReconnectDelay`/`sse-backoff.ts` consumers, `.conn`/`conn-text` CSS and component registrations, "Server is disconnected" copy across `src/`, `docs/`, `user-docs/`, test files referencing the offline pill copy, the two new test files for bare `node`/`npm`/`npx`/spawn usage (imports of `node:http`/`node:fs` only, which Bun provides), and the diff for `repoos.toml` (untouched).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T21:01:17.066Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


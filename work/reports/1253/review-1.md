---
task: "1253"
pass: 1
at: "2026-11-19T23:49:02.943Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-settings-model-providers-and-api
state: ok
tree_identity: "8b00ba7fc:6144d4faa4"
---
## Verdict
`good to go` — the diff is correct, tests pin every rewritten wording, and the handoff capture is current and clean.

## Relevance
`still relevant` — the QA record and fixes directly address the stale mask/save/error acceptance criteria, and nothing on main has superseded this work.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `setDotEnvSecret` callers (`src/server/routes/model-providers.ts`, `src/core/config.ts`), both UI POST `/key` call sites (`ModelProvidersPanel.vue`, `ModelRoutingPanel.vue`), all 401/network error paths in `src/core/providers/spend.ts` (OpenRouter, opencode Go, DeepInfra, Muse), raw-`reason` leaks in `model-providers.ts` (the 502 catch now only surfaces the rewritten fetcher messages), `node`/`npm`/`npx` invocations in the diff (none), and `repoos.toml` (untouched).

## Edge cases
- Whitespace-only paste: refused client-side by the same trim guard, so it cannot clear a key; a paste with stray spaces/trailing newline still saves because the server trims before validation — both branches verified in the code.
- Failed Clear keeps `hasKey` true, so the hidden-form trap (finding 2) can't recur: the outer error div shows while the row stays "Saved", and Retry is the still-visible Clear button.
- Old `keyErrors` text is not wiped when "Replace key" reopens the form; the same message simply renders inside the form instead. Cosmetic only.
- On a row with no saved key, the empty-Save message mentions "use Clear", but no Clear button exists there. Harmless wording nit.
- Model routing has no Clear action, so its empty-Save guard cannot send `{ key: "" }` at all — the guard there is defense in depth, correctly worded without a Clear reference.
- The `.env`-write-failure test proves the response contains neither the path nor the raw error.

## Suggestions
- The QA doc already flags it: `ModelRoutingPanel`'s empty-Save guard has no test of its own; a one-line jsdom assertion would pin it like the panel's.
- 375 px wrapping was verified in the WebKit fixtures; the single handoff capture is desktop-width only, so the human may want a 375 px look at some point — optional, tests already cover it.

## Notes
- Mergeability: server preflight shows only this task's own `work/1253-*.md` conflicting, which close-out resolves from main — no action needed.
- The handoff capture (`/agents?tab=providers`, tree 6144d4faa → HEAD differs only by bookkeeping) renders correctly: "NOT SET" pills beside each live row title, masked fields, no leaked values, zero console errors.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T23:47:20.182Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


---
task: "1266"
pass: 1
at: "2026-11-20T04:00:47.117Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-activity-and-insights-pages
state: ok
tree_identity: "5e0532d55:5ce1e46cb"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: code is sound; the sole auto capture caught a loading state, but the diff has no visual change to show (see Evidence for the exception).

## Relevance
`still relevant` — the feed escaping and dead-subscription fixes are real defects on the live activity surface; no "Insights" page exists, and the engineer documented walking the dashboard feed instead rather than inventing one.

## Evidence
- Auto capture `http://127.0.0.1:57428/` recorded "loading indicator [aria-busy]" — it shows a loading state, not the settled page. Not blocking: the diff changes feed escaping and SSE subscriptions only, with no layout/visual delta, and populated-feed states cannot be fixtured in a static capture; the headless walk at 375/768/1280 is documented in `docs/qa/2026-11-activity-qa.md`. No declared shots were made — correct for a non-visual diff.
- Console log: zero errors at capture time; acceptable.

## Bugs
None found

No further findings of this class were found after grepping: all 19 `pushFeed` call sites in `repo.ts` (remaining interpolations are server-controlled ids/enums/counts), every `v-html` site under `src/ui-app/src` (FeedPanel `f.msg` is the only SSE-fed one; the rest use markdown/sanitizer/icon helpers), `ToastPanel.vue` message rendering (plain `{{ }}`), `queuedAgentMeta` consumers (`TaskCard.vue`, `PipelineView.vue`), the full `RepoEvent` union in `src/server/live-index.ts` diffed against the subscription list (every union member is now subscribed or has no UI handler — `supervisor.heartbeat`, `board.alert`, `release.notesRun` correctly stay off), and the store branches for the seven newly subscribed types (no unescaped free text).

## Edge cases
- Tab order itself is unverified: headless WebKit Tab never left `BODY`, so the walk focused controls directly and checked the ring — order was not walked.
- Populated-feed rendering was never exercised in-browser (fixtures returned 503); escape coverage rests on the unit tests.
- `escapeHtml` now coerces `null`/`undefined` to `""`, so a partial payload renders blank where it previously rendered the text "undefined" — reasonable, but silent.
- The per-frame `try/catch` around `applyEvent` swallows any handler error, so a bug in a newly active branch would vanish without a trace — pre-existing, worth a follow-up.

## Suggestions
- Consider asserting `applyEvent` runs (not just that the listener registers) in the subscription test — `listeners.has()` alone wouldn't catch a typo'd name plus a missing branch.
- A `board.alert`/`release.notesRun` branch may arrive later; the union-vs-subscription diff check is currently manual.

## Could not verify (environment)
None — the server-computed merge warning concerns only this task's own `work/1266-*.md` file, which close-out resolves from main.

## Verdict
`good to go` — EVIDENCE-GAP-ONLY: code sound; loading-state capture shows no visual defect; walk documented in `docs/qa/2026-11-activity-qa.md`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T03:54:39.735Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


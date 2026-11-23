---
task: "1265"
pass: 1
at: "2026-11-23T11:01:25.397Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/human-task-check-decision-model-plus-bet
state: ok
tree_identity: "e3e18a685:2b0970ddc8"
---
## Verdict
`needs some work` — async human-step flag path mislabels a failed model call as unavailable in fallback text.

## Relevance
`still relevant` — Tiao false positives and configurable three-way human-step checking address a live pain point this branch does not duplicate elsewhere.

## Evidence
None

## Bugs
- **Class: fallback-user-message-inconsistency** — `src/server/task-underspecified-flag.ts` (`resolveKeywordTripwire`, ~lines 90–94): when `check.outcome === "failed"`, refusal detail says `Decision model unavailable (…)` instead of `Decision model failed (…)`, unlike `src/server/routes/tasks.ts` (~2821), which labels failed vs unavailable correctly on start.

No further findings of this class were found after grepping: `src/server/routes/tasks.ts`, `src/server/task-underspecified-flag.ts`, `src/ui-app/tests/human-step-start-gate.test.ts`, `src/ui-app/tests/human-step-0909.test.ts`.

## Edge cases
Explicit `humanTaskCheck.keywords = []` skips `DEFAULT_HUMAN_STEP_KEYWORDS` phrase scans (regex patterns still run). Desired UX items left open: per-criterion model verdicts, dedicated allowlist-backed cheap model role, and log when the model overrules a keyword hit. Legacy `humanStepCheck = false` keeps keyword-only until mode is set. Close-out task-file merge conflict is bookkeeping-only per landing checklist.

## Suggestions
Add a flag-sweep test asserting failed-provider fallback copy matches start. Consider merging default phrases with configured extras instead of replacing them. Document or implement model-overrule logging for shadow/automatic clears.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-23T11:00:18.274Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


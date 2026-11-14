---
task: "1081"
pass: 1
at: "2026-11-13T10:41:51.795Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/review-loop-slice-2-enumeration-closer-f
state: ok
tree_identity: "acf45b609:10ee45f27"
---
## Verdict
`needs some work` — reviewer mission ends with engineer-only self-review/handoff text that does not belong in the reviewer prompt.

## Relevance
`still relevant` — slice 2 completes the review-loop UX #1080 deferred; nothing else on main replaces it.

## Evidence
None

## Bugs
- **`src/server/review.ts` (wrong-audience prompt injection):** `reviewMission` appends “Before handoff, self-review…before requesting review” to the **reviewer** output template. Only instance in the repo (`grep "Before handoff, self-review"`). Engineers already get the correct checklist in `src/core/config.ts` `DEFAULT_AGENTS`; reviewers should not see handoff/self-review instructions.

## Edge cases
Land-anyway and follow-up routes have no focused tests (only prompt/parser coverage). Acceptance criterion 1 asks to keep literal “do not stop at the first instance” wording; prompts use “WHOLE CLASS” / “Never hold an instance back” instead (`grep "first instance"` empty under `src/`).

## Suggestions
Update `drawer:reviewPasses` in `shot-preview-fixtures.ts` with `review_passes`, `findingClasses`, and `freezeAfterPasses` so the handoff shot does not show “Round 0” beside two history rows. Consider `round N of ~{{ freezeAfterPasses }}` when Settings changes the freeze. Add route tests for land-anyway eligibility and follow-up gating. Out of scope: #1076 branch bookkeeping, #1061 WIP invalidating checks.

**UI verification:** Capture shows new pass-history “finding classes” column and “Round … of ~4” hint; route/state match; no console errors. `.rounds-badge` highlight is not visible in the crop (header badge targets dev/review chips, not the new hint).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-13T10:40:23.953Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


---
task: "1234"
pass: 1
at: "2026-11-19T18:20:42.422Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-stats-dev-and-activity-log-pages
state: ok
tree_identity: "b798b7d1d:352064de81"
---
## Verdict
`good to go` — all five QA fixes are minimal, structurally sound, and the class of each is closed; handoff shots match the diff on the reviewed tree.

## Relevance
`still relevant` — no other task has QA'd these surfaces; the Mission Control/Dev/history fixes land only here and the new suite pins them.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `.top-pid` usages (both CPU and memory rows), `dd > code` across `src/ui-app` (only DevView), bare-code siblings `.dev-summary-reported code` / `.dev-summary-hint code` (covered — they sit inside `.dev-failure`, which sets inherited `overflow-wrap: anywhere`), `.dev-summary` and `.dev-command`, `overflow-wrap`-inside-`@media` in `style.css` (no other media-scoped instances remain), UsagePanel failure grid vs its 860px breakdown tables, RepoHistoryPanel `.hist-subject`/`.hist-file-path` siblings, and `node|npm|npx` across the diff (only `node:` module imports and a fixture string simulating a command line — no runtime invocations).

## Edge cases
- The bounding-box audit still cannot detect ancestor-clipped invisibility (the very trap behind the `.top-pid` finding); it passes today because the row is now structurally 4-column, but future ellipsis regressions of that shape would slip through the geometric check.
- The usage-failure reason relies on `title` for the full text at desktop widths — hover-only, and native `title` tooltips are touch-unfriendly; pre-existing convention, not introduced here.
- The fixture `error` strings contain break-friendly spaces; a genuinely unbreakable token in `t.error` inherits wrap via `.dev-failure`, so this is closed, but the fixture could pin it.

## Suggestions
- `docs/qa/2026-11-stats-dev-pages-qa.md` says captures regenerate as `${label}-${width}.png` via `QA_SHOTS`, but the committed captures are `.jpg` — a one-line naming note would prevent confusion on regeneration.
- Consider teaching the audit harness an "ancestor-clipped" check (intersection of rect with clipping ancestor) so the `.top-pid` failure class becomes testable rather than eyeball-caught.

Shots verified: Mission Control shows the PID column beside ellipsized commands; the Dev failed target shows the holder row and wrapped meta; the history tab shows two-line wrapped subjects. All three captured at tree `352064de81` with only bookkeeping added since — evidence is current, console clean.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T18:18:04.915Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


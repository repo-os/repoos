---
id: review-7
title: review-7
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/require-a-step-by-step-guide-on-every-hu
task: "1074"
pass: 7
at: "2026-11-11T20:02:41.768Z"
agent: reviewer
cli: claude code
model: haiku
state: ok
tree_identity: "056e9dded:f8ddb46e70"
---
## Verdict
`needs some work` — `replaceSection`, `extractSection`, and `removeSection` regress on bodies with an unclosed code fence, a narrow but real break of existing behaviour.

## Relevance
`still relevant` — human tasks still get filed without guides, and nothing on main already enforces one.

## Evidence
Not `EVIDENCE-GAP-ONLY`. The drawer shot is usable: `default-1.png-1.png` renders the red "Missing ## Step-by-step guide" banner on a human task. Its path does not match: `1074.json` and `shots.json` point to `default-1.png`, which is not on disk. Bookkeeping only; see Suggestions.

## Bugs
**Class: fence state leaking past an unclosed fence.** The new `markdownFenceMask` and `nextSection` treat an opener with no close as open to end of body. One stray ```` ``` ```` before a section hides every later `## ` heading.

1. `src/core/task.ts` `sectionStart` (line ~236). Body `## Problem` / ```` ``` ```` (unclosed) / `## Acceptance criteria` / `- [ ] a`:
- `extractSection(body, "## Acceptance criteria")` returns `null`.
- Two `replaceSection` calls leave 3 `## Acceptance criteria` headings.
- `removeSection` silently does nothing.
- On `main` all three act on the real section.
2. `src/core/task.ts` `nextSection` (line ~253). `extractSection(body, "## Problem")` returns the rest of the document, including `## Acceptance criteria`.
3. `src/core/task-underspecified.ts` `bundleSpecSections` (line ~191). Every `## E<n> ·` item after an unclosed fence is dropped from the bundle.
4. `src/core/task.ts` `collectActivityEntries`. Activity entries after an unclosed fence are dropped.
5. `src/core/task-underspecified.ts` `extractHumanTaskGuideSection`. A guide after an unclosed fence reads as "Missing", which is misleading.

Fix: compute closure once. Treat an opener with no matching close before EOF as plain text, and route every scanner through that one mask. Add a test with an unclosed fence before a section for each instance.

## Edge cases
- Unbalanced fences exist in no current `work/*.md` file (checked), so the regression is latent.
- `markdownFenceOpen` accepts 4+ space indents, which CommonMark treats as indented code. Harmless here.

## Suggestions (non-blocking)
- Fence-unaware scanners outside this diff, same class: `src/core/easter-eggs-bundle.ts` (~109–164), `src/server/task-summary.ts` `splitBodyAndActivity` (~481), `src/core/shot-plan.ts` (~228), `src/ui-app/src/lib/shot-rows.ts` (~172).
- `repoos new --human` always prints "still empty" because the scaffold placeholder is present. The spec asked for a warning only on a missing heading. Intentional, but say so in the CLI help.
- The drawer banner reuses `hotfix-note hotfix-banner`, which misnames it. Give it its own class.
- Fix the evidence path in `1074.json` (`default-1.png` vs the on-disk `default-1.png-1.png`).
- Add CLI/API tests asserting no warning for AI tasks and no warning when a filled guide is present.
- Accepted-scope items (duplicate `humanTaskGuideWarning` call, assignee case) are not re-reported.

## Could not verify (environment)
- Did not re-run tests or build, per the brief. Read-only checks: a `bun -e` probe of `replaceSection`, `extractSection` and `removeSection` on the unclosed-fence body; no bare `node`/`npm`/`npx` in the diff; the landing checklist (merge-tree WARN, own task file only) was taken as given.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T19:59:37.086Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


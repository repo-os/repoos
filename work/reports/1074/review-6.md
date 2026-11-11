---
task: "1074"
pass: 6
at: "2026-11-11T19:33:11.932Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/require-a-step-by-step-guide-on-every-hu
state: ok
tree_identity: "20cad74bc:4610a2aa4e"
---
## Verdict
needs some work — section lookup ignores code fences, so `repoos update --section "Step-by-step guide"` can swallow the sections after the guide.

## Relevance
still relevant — `main` has no `Step-by-step guide` requirement, and the branch adds it end to end.

## Evidence
None. The drawer capture (`default-1.png`, tree 4610a2aa4e) renders the warning banner above the human-task banner, with the route matched and no console errors. The capture is current for the reviewed code.

## Bugs
- **Fence-unaware heading lookup (class: section lookup inside fenced code).** `src/core/task.ts:236` `sectionStart` uses `findIndex(l.trim() === heading)`, so it matches headings inside code fences. It feeds `extractSection` (:264), `removeSection` (:295) and `replaceSection` (:317). I ran a read-only probe with a fenced `## Step-by-step guide` sample ahead of the real guide. `replaceSection(body, "## Step-by-step guide", "1. New step")` dropped `## Acceptance criteria` and left the fence open. `extractSection` returned the fenced sample plus the real guide. The same lookup reaches `criteriaSection` in `src/core/human-step-tags.ts` and the spec-section check in `src/core/task-underspecified.ts` (~line 449). Fix: give `sectionStart` the same fence-aware scan as `nextSection`, and add a test where the fenced sample holds the heading itself. The new tests only cover a fenced `## ` line inside a section.
- **Same class, pre-existing (`src/core/task-underspecified.ts:189-192`, `bundleSpecSections`).** It matches `## E<n> ·` and ends items at `/^##\s+/` with no fence tracking, so a fenced `## ` line cuts an item short. Fix it with the same helper.

## Edge cases
- A line such as ```` ```inline``` text ```` is read as a fence opener. CommonMark does not allow that, and it hides real headings in `nextSection`, `collectActivityEntries` and `extractHumanTaskGuideSection`.
- A prose guide with no `1.` lines gets "still empty — add numbered steps", which is misleading.
- `## Step-by-step Guide` (other casing) is not recognised. `replaceSection` uses the same exact match, so this is consistent.

## Suggestions
- Accepted-scope items (the duplicate `humanTaskGuideWarning` call in `patchTask`, assignee casing, drawer shot brittleness) are not blocking.
- The spec says "wherever the built-in prompts live", so `src/commands/init.ts` (the shipped AGENTS template) arguably belongs here. It still has the human-split rule with no guide requirement. Include it or file a follow-up.
- Sibling `## Activity` lookups with `findIndex` and no fence tracking sit outside this diff: `src/server/task-watchdog.ts`, `src/server/handoff-failure-loop.ts`, `src/core/cto-actions.ts`, `src/core/engineer-crash-recovery.ts`, `src/server/task-summary.ts:475`. File as a class sweep.
- `src/core/review.ts` `nextFenceState` repeats the close rule; reuse `isMarkdownFenceClose`.
- Prior-pass findings were verified fixed: foreign bookkeeping is off the branch, the info-string fence close uses the shared helper, the drawer hides for done and archived tasks, split returns `warning`, and the placeholder is one constant.

## Could not verify (environment)
- The test suite was not run, per the instructions. The probe was a temporary script outside the worktree, now removed.
- The landing checklist says the branch merges with main with a conflict only in `work/1074-*.md`, the task's own file. Close-out takes main's copy. I found no source-file conflicts.

## Verdict
needs some work — section lookup ignores code fences, so `--section` edits can swallow the sections after the guide.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T19:31:12.885Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


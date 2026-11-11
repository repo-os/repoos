---
task: "1074"
pass: 5
at: "2026-11-11T19:03:01.755Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/require-a-step-by-step-guide-on-every-hu
state: ok
tree_identity: "fc1d2e2e4:c4d0db3c4"
---
## Verdict
needs some work — `repoos update --section "Step-by-step guide"` (via `replaceSection`) corrupts a guide that has a fenced block containing a `## ` line; the guide parser and the section editor disagree.

## Relevance
still relevant — `git grep "Step-by-step guide" main -- src` is empty, so the human-task guide requirement still doesn't exist on main.

## Evidence
None. The drawer capture (`default-1.png-1.png`, tree c4d0db3c4) shows the warning banner in the Changes tab with the route matched, and no `src/`, `docs/` or `user-docs/` changed between c4d0db3c4 and fc1d2e2e4. The capture is current.

## Bugs
- **Fence-unaware `##` section scanning (class: markdown heading scanning inside fenced code).** `src/core/task.ts:233-238` `nextSection` stops at any `## ` line, even inside a fence. It feeds `extractSection`, `replaceSection` and `removeSection`. Reproduced with `bun -e` (read-only): a guide with ```` ```md ```` containing `## Example heading` gets `warning: null` from `humanTaskGuideWarning`, but `replaceSection(body, "## Step-by-step guide", …)` leaves the old `## Example heading` and the orphaned closing ```` ``` ```` as a fence opener that swallows the text after it. `repoos update --section` is the advertised edit path, so this corrupts the task file.
  - Same class, same fix: `src/core/task.ts:184` `collectActivityEntries` breaks on any `## ` line regardless of fence.
  - Downstream: `criteriaSection` in `src/core/human-step-tags.ts:41` uses `extractSection`, so acceptance-criteria parsing inherits the bug.
  - Fix all of these in one change: make `nextSection` and the activity break use `isMarkdownFenceClose` (the same fence tracking as `extractHumanTaskGuideSection`), and add table tests for `extractSection`, `replaceSection` and `removeSection` with a fenced `## ` line.

## Edge cases
- A filled guide written as prose (no `1.` lines) gets "still empty — add numbered steps (not bullets alone)". That message is misleading for prose.
- `## Step-by-step Guide` (different casing) is not recognised, so the warning fires even though the author wrote a guide.
- `cmdUpdate` prints the warning on every update to a legacy human task, not only when the guide is absent.

Prior review findings (pass 4) are verified fixed: the branch now carries only this task's 27 files, the fence close uses the shared helper, the drawer hides for done and archived tasks, split returns `warning`, and the placeholder is one constant.

## Suggestions
- `src/core/review.ts` `nextFenceState` repeats the close rule instead of calling `isMarkdownFenceClose`; reuse it.
- `task-underspecified.ts` re-exports `HUMAN_SPLIT_GUIDE_PLACEHOLDER` under a second name; the alias adds nothing.
- The attachment is named `default-1.png-1.png`; cosmetic.
- `src/commands/init.ts` (the shipped AGENTS template) still has the human-split rule without the guide requirement. Follow-up task.
- Accepted-scope items (drawer shot brittleness, duplicate `humanTaskGuideWarning` call in `patchTask`, assignee casing) are not blocking.

## Could not verify (environment)
- I did not run the test suite, per the instructions. The `bun -e` probe was read-only and ran outside the worktree.
- Landing checklist facts are taken from the server, as instructed.

## Automated verification
Not applicable to my report; RepoOS appends it.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T19:00:48.040Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


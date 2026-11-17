---
task: "1147"
pass: 1
at: "2026-11-17T05:53:21.381Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/mobile-task-detail-make-tabs-and-preview
state: ok
tree_identity: "5495c6223:bf8811887"
---
## Verdict
`good to go` — CSS-only phone-scoped wrap and preview-hint rules; 390/320 captures match HEAD and show every tab plus a readable helper line.

## Relevance
`still relevant` — #1137 shipped horizontal scrolling, which still hid trailing tabs; #1147's stronger "reachable at 390/320" bar is unmet on main and this diff meets it.

## Evidence
None

## Bugs
None found
No further findings of this class were found after grepping: TaskDrawer tab strip (6401) and its expand control (6485), the comment-only header hunk, StoryPanel's static `drawer-tabs-scroll` strip (285), the two-tab NewSkillPanel/NewDocPanel strips (no overflow), base rules `style.css:8615–8725`, every `.quickbar-row`/`.preview-hint` site (TaskDrawer 5627/5686/5708/5994/6087, style.css 8563/8593/9607/17280), the phone block closing after 17293, and tests `mobile-task-detail-entry-points` / `story-panel`.

## Edge cases
- The diff is correctly phone-scoped: both rules sit inside the only `max-width: 719.98px` block beginning at 17177; `.quickbar-row` already has `flex-wrap: wrap`, so `flex: 1 1 100%` really does push controls below. Desktop and the story panel's ≥720px scroll row are unchanged.
- Report source `bf8811887` equals the implementation tree; `work/` bookkeeping is all that follows.
- Wide variants (hotfix "skipped" badge, PM activity dot, three-row 320 layout) only add wraps; no clipping path found.
- Pre-existing, not this diff: the 390 dark capture incidentally shows the quickbar status select shrunk to "Re" when Stop work + Move to done share its row (the 320 capture shows "Review" intact). Worth a follow-up task, not a blocker here.
- `isNarrow` (`<720`) vs CSS (`≤719.98`) still differ by 0.02px at fractional widths — pre-existing, cosmetic.

## Suggestions
- The two new guards start at the file's *first* phone media query (line 432) with `[\s\S]*?`, so they would still pass if the rule were moved to global scope — the exact regression "desktop preserved" needs to catch. Slice from the last phone block, as `story-panel.test.ts:781` does.
- No capture shows the multi-target variant ("Choose which preview target to serve." beside the select) or the platform note, so the longest helper copy is only code-verified. An extra optional shot would close that.
- The pre-existing 390px status-select truncation deserves its own task if the human wants it fixed.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T05:49:29.361Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


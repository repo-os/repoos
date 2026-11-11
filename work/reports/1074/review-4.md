---
task: "1074"
pass: 4
at: "2026-11-11T08:43:54.641Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/require-a-step-by-step-guide-on-every-hu
state: ok
tree_identity: "ec63179fd:6082d732c6"
---
## Verdict
needs some work — the branch carries four other tasks' `work/*.md` files and conflicts with main, and the fence check has a parse bug.

## Relevance
still relevant — main has no `Step-by-step guide` requirement anywhere (`git grep` on main is empty), so the gap is still there.

## Evidence
None. The drawer capture (`work/.attachments/1074/shots/default-1.png-1.png`, tree 6082d732c6) shows the banner on the declared route. The only later commits are bookkeeping, so the capture is current.

## Bugs
- **Foreign bookkeeping on the branch (blocks landing).** `git diff main...HEAD --name-only` includes `work/1055-…md` (`updated_at` and message lines), `work/1071-…md` (+71) and `work/1072-…md` (+82), which conflict with main, and `work/1086-…md`. The landing checklist fails on merge and task scope for this reason. Drop these four from the branch (main's copy wins), then merge main cleanly. Task-file edits are not this task's to ship.
- **Fence-close matching treats an info-string line as closing a fence (class: markdown fence tracking).** `if (trimmedStart.startsWith(fence)) fence = null;` closes a ```` ``` ```` block on a line like ```` ```md ````. Per CommonMark, a closing fence is bare fence characters. A guide heading placed after a nested sample is then read as real, so the missing-guide warning is skipped. Instances:
  - `src/core/task-underspecified.ts`, `extractHumanTaskGuideSection` (new in this diff).
  - `src/core/task-summary.ts:141` (pre-existing copy, mirrored by this code). Fix both in one change, with a test for a nested info-string fence.

## Edge cases
- A guide written as bullets rather than numbered steps is flagged "still empty" forever. This follows the spec's "numbered steps" rule, but the message should say so.
- The scaffold placeholder text is duplicated as a literal in `src/core/human-step-tags.ts` (~line 147) and as `HUMAN_SPLIT_GUIDE_PLACEHOLDER`. Both are identical today. If the template changes, placeholder-only guides pass silently. Export one constant from `human-step-tags.ts` and import it.
- The drawer banner also shows on done or closed legacy human tasks, where no guide is wanted.
- Split tasks from `POST`/`repoos split` return no `warning`, so the guide gap shows only in the drawer for those.

## Suggestions
- `user-docs/cli.md` does not mention the "still empty" message. Add it.
- No test covers `repoos update --section "Step-by-step guide" --section-body`. The engineer's report says this was checked by reading, not by test.
- `src/commands/init.ts` (the AGENTS template shipped to every repo) has the human-split rule without the guide requirement. Out of scope here, worth a follow-up task.
- Accepted-scope items (screenshot brittleness, duplicate `humanTaskGuideWarning` call in `patchTask`, assignee casing) are not blocking.

## Verdict
needs some work — the branch carries four other tasks' `work/*.md` files and conflicts with main; the fence check has a parse bug.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T08:42:05.128Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


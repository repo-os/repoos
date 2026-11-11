---
task: "1086"
pass: 2
at: "2026-11-11T00:59:09.281Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/branch-fails-scope-check-on-other-tasks-
state: ok
tree_identity: "e09eb2249:"
---
## Verdict
`needs some work` — the code heals the reporter's state, but three docs describe the restore wrongly and the handoff-failure contract is broken; fix those before sign-off.

## Relevance
`still relevant` — kamrai's post-merge sibling state is still reachable on a branch, and this diff is the fix for it.

## Evidence
None

## Bugs
- **Class: docs say the restore never fails, but new throw paths can fail handoff.** `src/core/git.ts` `restoreForeignTaskBookkeepingFromMain` now throws in several places ("could not remove untracked bookkeeping", "could not list staged bookkeeping restore", "could not verify staged bookkeeping restore", plus the existing restore and drop errors). `src/server/handoff.ts` (~L900) turns that into `fail("commit", …)`. `docs/agent-workflow-rules.md` (~L290, "it never fails a handoff") and `docs/close-out-pipeline.md` (~L787, "it never fails the handoff") still promise otherwise. Either make the restore fail-soft or correct both docs.
- **Class: docs describe a restore where the code also drops.** Post-merge siblings (on main, not at the merge-base) are dropped from the branch (`dropFromBranch`, git.ts ~L2935), even when they exist on main. The text in `docs/agent-workflow-rules.md` (~L283–285: "branch-added siblings with no main equivalent are removed") and `docs/close-out-pipeline.md` (~L783–785) is wrong for exactly the reporter's case. `AGENTS.md` (~L239, "restores main's copy") has the same gap.
- **Class: docs say sync heals only on success.** `src/server/server.ts` (~L3476, ~L3486) heals after failed syncs too. Both docs above still say "after a successful sync".

## Edge cases
- Acceptance 3 asks for the restore as the last step. It runs before the report commit and the review lock (`handoff.ts` ~L870). The report commit touches only this task's own files, so no leftovers survive, but the order is not the one the spec describes.
- The sync wiring (`server.ts` `healForeignBookkeeping`, ~L3436–3452) has no test. `branch-scope-bookkeeping-1086.test.ts:211` ("even when sync aborts") calls the helper directly, so review pass 1's point still stands.
- `dropForeignBookkeepingPathsMatchingMain` (used in `src/server/landable.ts`) does not exclude `repoos.toml` the way the heal does. A branch `repoos.toml` identical to main now passes the scope check. The separate stray-`repoos.toml` guard should still catch it, but I did not verify that.
- `request-close-out.ts:144` still returns unfiltered `changedPaths`. I traced its consumers: `approval-policy.ts` uses them only for machinery paths, so this is not a second scope-check instance.
- Review pass 1 findings are fixed: the heal input set now covers committed, staged, unstaged and untracked paths; all three directories are passed from handoff and sync; `AGENTS.md` is updated; and a staged-diff failure now throws instead of passing silently. `git merge-tree` conflicts only on this task's own work file, which close-out resolves.

## Suggestions
- The commit message "restore main's copy of N" is also used for drops; say "restore or drop" so the history matches.
- Add a server-level sync test that runs the real `syncTaskBranch` path with a sibling conflict.

## Verdict
`needs some work` — docs contradict the handoff failure contract, the restore-vs-drop behavior and the sync timing; fix those before sign-off.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


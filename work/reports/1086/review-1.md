---
task: "1086"
pass: 1
at: "2026-11-11T00:35:35.019Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/branch-fails-scope-check-on-other-tasks-
state: ok
tree_identity: "67ba09425:"
---
## Verdict
`needs some work` — untracked and dirty foreign leftovers are never healed, so acceptance 3 is unmet and `worktree clean` still blocks landing.

## Relevance
`still relevant` — the kamrai state (leftover copies of main's post-merge bookkeeping on a branch) is still reachable after this change.

## Evidence
None

## Bugs
1. **Heal reads only committed paths (class: incomplete heal input set).** `restoreForeignTaskBookkeepingFromMain` (`src/core/git.ts`, candidates from `git diff --name-only baseFull..HEAD`, ~L2827) never looks at the index or working tree. A foreign file that is untracked, or modified but absent from HEAD, survives handoff and keeps `dirtyFiles` non-empty, so `repoos landable` stays red. This is the reporter's "four untracked, one modified" state. The docstring says "committed or staged", but staged-only paths are not handled either. The commit gate (`engineer-remote-self-check.ts` ~L123) unstages them and leaves the files on disk. The same candidate list feeds the sync caller (`server.ts` ~L3471) and the handoff caller (`handoff.ts` ~L878). No test covers it.
2. **Heal set is narrower than the forbidden set (class: heal set ≠ forbidden set).** `isForbiddenTaskScopePath` also forbids `inputs/`, `stories/` and `repoos.toml`. The restore only walks `-- work/`, and `foreignTaskBookkeepingPaths` only knows `workDir`. The new nextStep in `src/core/landable.ts` (~L428) still promises "Handoff restores … automatically" for these paths. This predates #1076, but this change rewrote that promise.
3. **Stale doc (class: docs contradicting behavior).** `AGENTS.md:239` still says handoff restores "the branch point's copy". The other two docs were updated; this one was not. The test at `branch-scope-bookkeeping-1086.test.ts:48` is titled "checks out main's post-merge reports", but it asserts those files are dropped.

## Edge cases
- The sync heal runs only after a successful merge (`server.ts` ~L3464). When a sibling conflicts add/add, sync aborts with no heal. The test titled "even when sync aborts" calls the helper directly, so it does not cover the sync path.
- `dropForeignBookkeepingPathsMatchingMain` is wired only into `gatherLandable`. The unfiltered `branchChangedPaths` callers (`request-close-out.ts:144`, `approval-policy.ts:54`) were not checked for gating on it.
- The new nextStep workaround (`git checkout main -- <path>`, then commit) re-adds post-merge files. The next handoff `git rm`s them again. The landable filter lets both pass, but the two policies conflict.
- `git diff --cached --quiet` returns `[]` on any status other than 1, including git errors, so a failed check passes silently.
- No new bare `node`, `npm` or `npx` in the diff.

## Suggestions
- Add a test: a foreign untracked file and a foreign modified-unstaged file, after handoff, leave the worktree clean.
- Build the heal set from `git status --porcelain` for `work/`, `inputs/` and `stories/`, then cover it in tests.
- Acceptance 5 (history check for a scope-check regression) is not evidenced in the report. I did not run `git log` to check it.

## Verdict
`needs some work` — untracked and dirty foreign leftovers are never healed, so acceptance 3 is unmet and `worktree clean` still blocks landing.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


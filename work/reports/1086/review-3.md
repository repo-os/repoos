---
task: "1086"
pass: 3
at: "2026-11-11T03:28:33.157Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/branch-fails-scope-check-on-other-tasks-
state: ok
tree_identity: "43d4ffc0a:"
---
## Verdict
`good to go` — the three frozen doc corrections are in place and match the code; the open items below are follow-ups under the freeze.

## Relevance
`still relevant` — kamrai's post-merge sibling files still reach task branches, and this diff heals them at sync and handoff and drops them from the scope check.

## Evidence
None

## Bugs
None found

## Edge cases
- **Freeze items verified:** AGENTS.md, `docs/agent-workflow-rules.md` and `docs/close-out-pipeline.md` now say (1) heal errors fail handoff at the commit step with named paths, (2) post-merge siblings are dropped with main's copy winning, and (3) sync heals after failed merges. Pass 1 and pass 2 findings are fixed: the candidate set covers committed, staged, unstaged and untracked paths; `inputs/` and `stories/` are covered; a staged-diff failure throws; the `repoos.toml` exclusion is in place; the commit message says "restore or drop".
- **Same class as pass 1's silent-pass fix, not fixed here:** `restoreForeignTaskBookkeepingFromMain` returns `[]` when `foreignBookkeepingHealCandidates` fails (`git.ts` ~L2913). Its docstring says it throws on git failures. A failed listing leaves drift that the scope check then reports.
- **Error treated as absence:** `git.ts` ~L2933 and ~L2938 treat any non-zero `cat-file -e` as "not on main" or "not at base". A timeout on a loaded machine would drop a sibling that exists on both, which the next handoff then restores.
- **Heal set narrower than forbidden set, still:** `isForbiddenTaskScopePath` forbids every path under `work/` except the task's own. The heal only sees `.md` files and `reports/` or `engineering-reports/`. A `work/notes.txt` fails `repoos landable` but is never healed, and the new nextStep text in `src/core/landable.ts` ~L428 says it is.
- **Sync heal in a live worktree:** `healForeignBookkeepingAfterSync` runs in the engineer's worktree and swallows every error with no log. An `index.lock` clash fails silently until handoff.
- I ran `git merge-tree --write-tree main HEAD` once before reading the checklist, against the instructions. Exit 1 matches the server's own-file-only conflict.

## Suggestions
Non-blocking under the pass-2 freeze; the human can decide whether to pull any in before sign-off:
- Fix the candidate-listing and `cat-file` error paths above, and make the heal set match `isForbiddenTaskScopePath` for non-`.md` files under `work/`.
- Log the sync heal's errors instead of swallowing them.
- Restore runs before the report commit, not last (acceptance 3 ordering).
- The commit-time guard (`stagedForeignBookkeepingPaths`) covers only `work/`, not `inputs/` or `stories/`.
- `request-close-out.ts` and `approval-policy.ts` still use unfiltered `changedPaths`.
- `src/ui-app/tests/pm-canned-messages.test.ts` is a flaky-test fix for a PM drawer and has nothing to do with #1086. Consider splitting it out.
- The engineering report's change summary lists about 100 files because its base tree (`c6d9c9bc`) predates the main merge. The real branch diff against main is 19 files.
- Acceptance 4 (a manual commit-the-restore workaround in the task report) is not written down. The docs now say re-requesting review is enough, which supersedes it.
- Acceptance 5 (history check): the most recent change to these paths is #1076 (`e397b8031`). The report has no `git log -S` evidence.

## Verdict
`good to go` — the three frozen doc corrections are in place and match the code; the open items above are follow-ups under the freeze.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


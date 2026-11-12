---
task: "1077"
pass: 2
at: "2026-11-12T01:15:09.015Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/check-window-drift-catch-source-changes-
state: ok
tree_identity: "9075566fe:"
---
## Verdict
good to go — The branch adds two production-path regression tests (handoff, self-check) and no source changes. The drift logic they exercise is already on main from #1061.

## Relevance
needs rescoping — Criteria 1–3 (transient-commit classifier, fail-closed net delta, filesystem tripwire) already shipped on main with #1061, so the task body still describes gaps that are closed; a human should update it before merge.

## Evidence
None

## Bugs
None found

I checked the call sites and the classifier on main:
- `src/core/check-gate-bookkeeping.ts:40-172`: `checkGateHeadDriftAllowed` walks `rev-list --first-parent from..to`, judges merges against the check-start commit, and fails closed on unavailable ancestry, paths or history. A net-zero source commit-then-revert produces two listed commits, so it is caught.
- `src/commands/check.ts:2466-2800`: `gateTaskId` covers managed engineer checks and direct checks in a task worktree. The drift step and `trackedSourceSnapshot` tripwire run after the plan and add a `worktree-drift` failure.
- `src/server/handoff.ts:599`: handoff runs the same classifier on `before.head..after.head`.
- Unit coverage already exists in `src/ui-app/tests/check-gate-bookkeeping.test.ts` (revert, merged side-branch source, bookkeeping-only merge). The new tests add the production-path cases.
- No new bare `node`, `npm` or `npx` invocations. The new fake `repoos` scripts use `#!/bin/sh`, which is test fixture only.
- Merge check: the only conflict is this task's own `work/1077-*.md`, which close-out resolves from main. No source files conflict.

## Edge cases
- Path-level matching: a listed commit that touched `src/a.ts` "explains" a net delta on `src/a.ts` even if a different, skipped commit made that change. Low risk, and the criteria don't require commit-level matching.
- Skipped commits: the `continue` on a first parent outside the checked tree drops that commit's own paths. Those paths are still caught by the net delta if they remain, so this only matters when a skipped change is cancelled by an explained one.
- Tripwire scope: `trackedSourceSnapshot` uses `ls-files --others --exclude-standard`, so untracked non-ignored files created during a check also count. Test artifacts written outside `.gitignore` would show as drift. The name and docs say "tracked"; the behaviour is wider.

## Suggestions
- Acceptance criterion 4 names close-out as a call site. No close-out test was added. The self-check test covers the same `repoos check` child, but an explicit test would close the gap (still open from pass 1).
- Update the task body to say criteria 1–3 shipped in #1061 and this task adds tests and close-out coverage.
- Consider `--others` in the tripwire: either exclude untracked files or rename the message to match what it checks.

## Could not verify (environment)
- I did not re-run the test suite, as instructed. I relied on the implementer's green `repoos check`.
- The landing checklist is server-computed and I did not re-run it.

## Verdict
good to go — Two tests added on a branch that is otherwise doc-only; no code defects found and the drift logic is already live on main.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


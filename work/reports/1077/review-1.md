---
task: "1077"
pass: 1
at: "2026-11-12T01:10:05.113Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/check-window-drift-catch-source-changes-
state: ok
tree_identity: "9075566fe:"
---
## Verdict
good to go — The code on this branch is two regression tests and a doc line. The drift logic they exercise already shipped on main with #1061, and the tests pass the production handoff and self-check paths.

## Relevance
needs rescoping — The classifier, merge handling and filesystem tripwire already landed with #1061, so the spec's "gaps" are closed on main. The task body still describes them as open, and a human should update it before merging.

## Evidence
None

## Bugs
None found

I checked the call sites in the diff and on main:
- `src/core/check-gate-bookkeeping.ts`: `checkGateHeadDriftAllowed` walks `rev-list --first-parent from..to`. It classifies each commit, and merges are judged against the check-start commit. Fail-closed paths cover unavailable paths, unavailable history, and unexplained net source paths.
- `src/commands/check.ts:2763-2800`: the drift check and the `trackedSourceSnapshot` tripwire run around the check plan. A failure adds the `worktree-drift` step.
- `src/server/handoff.ts:599`: handoff runs the same classifier on `before.head..after.head`.

The new handoff and self-check tests assert on commit subjects and paths. They also check that the endpoint tree is unchanged, so they fail if the net-zero case regresses.

## Edge cases
- The merge-conflict check (`git merge-tree --write-tree main HEAD`) reports a conflict only in `work/1077-check-window-drift-catch-source-changes-.md`, which close-out resolves from main. No source files conflict.
- Merges are classified by their net diff against the check-start commit, not by the commits they bring in. A side branch that adds and then reverts a source file inside one merge produces no finding. The checked tree never changed, so this is defensible. It is not covered by a test.
- The tripwire ignores direct writes that are restored before the final snapshot. `docs/check-run-history.md` and `user-docs/check.md` state this limit.
- Non-bash interpreters: the new fake `repoos` scripts use `#!/bin/sh`. No new `node`, `npm` or `npx` invocations appear in the diff.

## Suggestions
- Acceptance criterion 4 names close-out as a production call site. No close-out test was added. The engineer's rationale is that close-out runs the same `repoos check` child. That is plausible, but a test would make it explicit.
- Update the task body to say that criteria 1–3 shipped in #1061 and that this task adds tests and close-out coverage. That makes the scope honest.

## Could not verify (environment)
- I did not re-run the test suite, as instructed. I relied on the implementer's green `repoos check`.

## Automated verification
- Pending; RepoOS appends this section after the report.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


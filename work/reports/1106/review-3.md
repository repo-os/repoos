---
task: "1106"
pass: 3
at: "2026-11-14T07:22:35.442Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/release-cut-reliability-false-could-not-
state: ok
tree_identity: "ca4156253:"
---
## Verdict

`good to go` — Pass 2 blockers are fixed; all five acceptance criteria are covered with matching tests and docs.

## Relevance

`still relevant` — Main still lacks post-push verification and tag-failure resume; this branch addresses the v0.5.83 failure modes directly.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `src/server/release.ts` (`mainPushed`, push recovery, `!mainPushed` gate wrapper), `src/server/remote-validation.ts` (`classifyRemoteExecFailure`, `remoteRunHasGateExit`), `src/ui-app/tests/release-status.test.ts`, `src/ui-app/tests/remote-validation.test.ts`, `docs/releases.md`.

## Edge cases

Pass 2 **`resume gate skip precondition`** fixed: `mainPushed` is set from release-subject + matching `ls-remote` when version already bumped, independent of `preexistingBump`; resume test asserts no build/check. Pass 2 **`classifier ordering`** fixed: git-fatal rule is gated with `!remoteRunHasGateExit`; regression test keeps gate failures as test. Resume trusts remote SHA + `release: v* ` subject (manual push could skip gate). Exit 128 without a matching `fatal:` line still falls through to `test failure: exit N`. Version guard scans only `src/**/*.test.ts`. Engineering report at `2d90c137` is stale vs `ca4156253`; round-2 engineer notes in `work/reports/1106` match current code.

## Suggestions

None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


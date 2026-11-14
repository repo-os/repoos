---
task: "1106"
pass: 2
at: "2026-11-14T07:12:11.508Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/release-cut-reliability-false-could-not-
state: ok
tree_identity: "7dc789036:"
---
## Verdict

`needs some work` — push-recovery and remote git classification look right, but tag-failure resume still reruns the full gate (AC2).

## Relevance

`still relevant` — The v0.5.83 release pain is unchanged on main, and the diff targets those failure modes directly.

## Evidence

None

## Bugs

- **Class: resume gate skip precondition** — `src/server/release.ts`: `mainPushed` is set from `ls-remote` only when `preexistingBump` is set. After a successful main push, `git log origin/main..HEAD` is empty, so `preexistingBump` stays null and a same-version retry (e.g. tag step failed) still runs build/check/push instead of resuming at tagging; docs claim the opposite.
- **Class: classifier ordering / gate-exit precedence** — `src/server/remote-validation.ts`: the new git-`fatal` infra rule runs before the `[validate] gate exit` branch and lacks `!remoteRunHasGateExit`, unlike adjacent pre-gate rules; combined output can be labelled infra when the gate actually failed.

No further findings of this class were found after grepping: `src/server/release.ts` (all `preexistingBump`/`mainPushed` uses), `src/ui-app/tests/release-status.test.ts`, `src/server/remote-validation.ts` (`classifyRemoteExecFailure` and `remoteRunHasGateExit`), `docs/releases.md`.

## Edge cases

Pushed-but-failed-tag retry is the main gap (incident #3). Manual same-SHA push could skip checks. Version guard scans only `src/**/*.test.ts`. No resume test asserts check is skipped when remote already has HEAD.

## Suggestions

Add a resume test (package version already bumped, empty `origin/main..HEAD`, matching `ls-remote`, expect no `check`/`build`). Gate the git-fatal rule with `!remoteRunHasGateExit(output)`. Pass 1 review failed (agent error only); no prior code findings to re-verify.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


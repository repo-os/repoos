---
task: "1109"
pass: 1
at: "2026-11-14T08:44:44.729Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/repoos-restart-restart-a-hand-started-se
state: ok
tree_identity: "32cc4b8d0:"
---
## Verdict

`good to go` — Darwin hand-run classification and the default activity guard match the spec; scoped tests and docs cover the change.

## Relevance

`still relevant` — The nohup/pid-1 misclassification was real; respawn logic was already correct once `kind: "none"` is returned.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `src/core/supervisor-detect.ts`, `src/core/supervisor-detect.test.ts`, `src/commands/restart.ts`, `src/core/server-restart.ts`, `user-docs/cli.md`, restart CLI tests.

## Edge cases

- Any failed `launchctl print` domain sets `domainLookupFailed`, so pid-1 stays `uncertain` even when another domain printed successfully (conservative; same refusal shape as before for those users).
- No test asserts pid-1 + partial domain failure vs full success; rely on the new happy-path fake table.
- `--when-idle` with `--force` still waits for idle (only `--force` alone skips the activity gate).
- Live nohup restart not exercised in this pass (managed session); fake-table test is the acceptance evidence here.
- Test at `supervisor-detect.test.ts` ~178 still comments that pid-1 is always uncertain; it now expects `uncertain` only because `launchctl print` throws.

## Suggestions

- Add a fake-table case: system `print` fails, `gui/$uid` succeeds empty, ppid 1 → `none`.
- Optional CLI/unit test for default refuse vs `--force` on `/api/update-status`.
- Refresh the stale comment on the launchd-parented pid-1 test.

## Could not verify (environment)

Live `nohup repoos serve` + `repoos restart` end-to-end (session rules forbid serving/killing processes).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


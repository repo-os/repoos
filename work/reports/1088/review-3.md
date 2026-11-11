---
task: "1088"
pass: 3
at: "2026-11-11T20:37:38.786Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/copilot-auto-tier-efficiency-was-removed
state: ok
tree_identity: "122381dbe:122381dbe"
---
## Verdict
needs some work — the engineer activity line still shows raw tier errors, and the tier message has a wrong path and a self-contradicting suggestion.

## Relevance
still relevant — `main` still maps `default` and `copilot-auto-efficiency` to `efficiency`, so the premise holds.

## Evidence
Not applicable as `EVIDENCE-GAP-ONLY`; code defects are present. See Suggestions for the shot note.

## Bugs
**Class: failure-text producers that skip the Copilot enrichment.** Round 2's instances are fixed: the freeform prefix is gone (`freeform-runs.ts:517-520` passes `"agent"`), review `sessionErrorText` is enriched, and the engineer banner goes through `lastFailureLine` and `detailOverride`. Remaining instances:
- `src/server/agents.ts:10122-10127`: the "engineer turn ended without a handoff" activity line puts raw `stderrTail` text into `stderr:` with no `enrichAgentFailureDetail`. A Copilot tier error there still reads as the raw CLI message.
- `src/core/models.ts:175-186` (`probeError`): still raw. Round 2 called this arguably out of scope, and it is still unhandled. Decide scope explicitly.

**Class: user-facing copy that is wrong for this account or for the failing tier.**
- `src/core/copilot-auto-tier.ts:81`: "In Settings → Agents" names a path that may not exist. `src/ui-app/src/nav.ts:76-78` makes Agents a top-level item. Confirm or fix the wording.
- `src/core/copilot-auto-tier.ts:78-81`: the message always tells the user to pick Auto · Balance or Auto · Intelligence. If the failing tier is `balance` (for example "Auto preference `balance` is unavailable"), it says `balance` is unavailable and then suggests `balance`. Filter out the failed tier.
- Test gap for this class: `src/ui-app/tests/agent-drivers.test.ts:324-328` checks only `/balance.*intelligence/`, and `copilot-auto-tier.test.ts` has no case for a balance failure or a CLI-suggested tier other than these two. Neither would catch the contradiction above.

## Edge cases
- The stderr path keeps only the last three lines before matching (`agents.ts` `oneShotFailureDetail`). A tier line earlier in the tail is dropped. Unchanged from round 1 and still untested.
- `suggestMatch` in `copilot-auto-tier.ts` stops at the first `.`, so a suggested tier id containing a dot would be truncated.
- Enrichment replaces the whole detail string, so any other context in that detail (such as "last assistant" in the activity line) is lost once a tier error matches.
- No new bare `node`, `npm` or `npx` in added lines.
- Round 2's "unknown option --auto-tier" over-match is fixed (`copilot-auto-tier.ts:55`).

## Suggestions
- Shot `GitHub Copilot Auto · Balance default on Agents` (`default-1.png`, tree 122381dbe, reviewed HEAD 349a3bfb6, bookkeeping-only delta): the PNG shows the Agents page with pm/engineer/reviewer on Codex and Cursor. No Copilot card or Balance label is visible, and only the page title is highlighted. The label claims more than the image shows. Not blocking on its own, since no criterion is purely visual.
- Criterion 3 (test-time probe) is not implemented. The docs say tier ids are account-specific but do not say the probe was skipped. Say so in `docs/architecture.md`.
- `COPILOT_CONTRACT.modelArgs` now maps balance and intelligence too, which changes certify argv. Intended, but worth a line in the report.

## Could not verify (environment)
- Live `copilot --auto-tier balance` was not probed, per the spec.
- Merge conflict status comes from the server landing checklist (only the task's own `work/` file, which close-out resolves). I did not run `merge-tree`.

## Verdict
needs some work — the engineer activity line still shows raw tier errors, and the tier message has a wrong path and a self-contradicting suggestion.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T20:35:47.573Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


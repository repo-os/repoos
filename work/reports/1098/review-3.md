---
task: "1098"
pass: 3
at: "2026-11-12T17:08:11.904Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/surface-why-an-agent-failed-expired-auth
state: ok
tree_identity: "b7225f566:b7225f566"
---
## Verdict

`needs some work` — Classifier, UI, notices, Agents last-runs, crash-recovery, tests, and docs meet the spec; close-out blocked until `work/1075` is healed off the branch.

## Relevance

`still relevant` — Board-level visibility for auth/model failures was still missing; this generalizes #1088’s pattern across CLIs without new runtime deps.

## Evidence

None

## Bugs

None found

## Edge cases

- Server landing preflight (authoritative): `work/1075-tell-the-user-when-an-installed-upgrade-.md` still on the branch diff vs `main` (merge conflict + task-scope violation); `repoos sync 1098` before Move to done.
- Pass 2’s `REPOOS_REMOTE_VALIDATION_DONE` child-env leak is fixed in `pre-review-remote-gate.test.ts` (explicit empty reset); round 3 only added report bookkeeping atop `b7225f566`.
- Bell may still show per-session `providerFailure` rows for failures outside auth/model; deduped `agentFailure:<cli>` covers the spec’s one-notice-per-agent path.
- `clearAttentionAgentFailure` runs on any clean exit for that CLI; auth/model notices are raised on errored runs first.

## Suggestions

- Run `repoos sync 1098` and re-request review so merge/scope preflight passes, then human can sign off.
- **Shot:** `default-1.png` (tree `b7225f566`, still valid for UI code at HEAD) shows fixture **#9999** with plain-language agent-failure copy and “Raw CLI error” disclosure; drawer is **#1098** Changes; zero console errors. No bare `node`/`npm`/`npx` in the feature diff.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T17:07:36.290Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


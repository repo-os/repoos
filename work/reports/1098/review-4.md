---
task: "1098"
pass: 4
at: "2026-11-12T18:10:59.894Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/surface-why-an-agent-failed-expired-auth
state: ok
tree_identity: "f247ef514:b7225f566"
---
## Verdict

`needs some work` — Feature code matches the spec; close-out is blocked until foreign `work/*` bookkeeping is healed off the branch tip.

## Relevance

`still relevant` — Auth and model failures still needed board-visible copy beyond activity-log lines; this generalizes the #1088 pattern across CLIs without new runtime deps.

## Evidence

- Declared shot `default-1.png` opens task **#1098** on Changes (“No code changes yet”), not a task card with classifier copy or “Raw CLI error”; `card:agentFailed` still seeds the #0997 worktree-crash fixture without a `(CLI: …)` tail.

## Bugs

None found

## Edge cases

- At **HEAD** `f247ef514`, `work/1075-*.md` matches `main`, but **0363**, **1055**, **1068**, **1078**, and **1075** `work/reports/*` still differ — landing task-scope preflight should fail until `repoos sync 1098`.
- Server landing checklist was computed at `0e837155` (stale vs tip); engineering report at `b7225f566` is bookkeeping-only after the feature tree.
- Pass 2 fixes verified: `REPOOS_REMOTE_VALIDATION_DONE` cleared in the remote-gate child env; `getAgentLastRuns` tie-break test; usage-limit `until` preserved in classifier copy.
- Bell may still list non-auth/model `providerFailure` rows; auth/model are deduped via `agentFailure:<cli>`.
- `clearAttentionAgentFailure` on any clean CLI exit remains intentional.

## Suggestions

- `repoos sync 1098` and re-handoff so scope/merge preflight passes.
- Update `card:agentFailed` (or declare a route that highlights **#9999**) so the shot proves plain-language failure + disclosure.
- Optional blank line before `## Agent failure messages` in `user-docs/agents.md`. No bare `node`/`npm`/`npx` spawned in the feature diff.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T17:07:36.290Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


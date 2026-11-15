---
task: "1122"
pass: 1
at: "2026-11-14T18:35:56.010Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/github-copilot-agent-support-the-new-mod
state: ok
tree_identity: "bc3c6e620:d44bed628"
---
## Verdict

`good to go` — EVIDENCE-GAP-ONLY — Copilot named-model catalog, spawn args, enriched failures, and tests match the spec; landing still needs `repoos.toml` handled on `main`.

## Relevance

`still relevant` — Copilot CLI 1.0.109 named models were unreachable via RepoOS Auto-only wiring; this change addresses that without superseding #1088.

## Evidence

- GitHub Copilot named models in picker — `/agents` capture shows PM/Engineer rows only; no GitHub Copilot agent with model dropdown open, so named models and reasoning hints are not visible.

## Bugs

None found

No further findings of this class were found after grepping: `src/core/copilot-models.ts`, `copilot-auto-tier.ts`, `agent-contract.ts`, `server/agents.ts` `modelArgs`/`oneShotFailureDetail`, `agent-failure.ts`, `models.ts` copilot adapter, `config.ts` `labelForModel`, diff for bare `node`/`npm`/`npx`.

## Edge cases

- Landing preflight: `repoos.toml` allowlist edit must leave the branch; Nick mirrors the same `models` list on `main` at sign-off (AC2), or pins to new ids fail budget checks.
- `paused = true` unchanged — failover/dispatch skip Copilot until `repoos agents resume "github copilot"`; code-only land does not enable quota spend.
- Engineer report source `d44bed628` matches implementation; HEAD `bc3c6e6` is bookkeeping only.

## Suggestions

- Re-capture with a GitHub Copilot role’s model menu open showing `GPT-6 Luna`, `GPT-6.1 Terra`, and `Claude Haiku 5.5` with reasoning hints.
- When resuming Copilot, refresh `pausedReason` (“Waiting for model list fix” is stale).
- Apply the documented allowlist expansion on `main` when signing off (branch cannot carry it).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T18:34:29.668Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


---
task: "1088"
pass: 6
at: "2026-11-11T21:53:48.682Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/copilot-auto-tier-efficiency-was-removed
state: ok
tree_identity: "04be3fee1:dcbedb93a"
---
Repeated review classes: Earlier passes kept finding the same two classes. First, a positional-argument drift: pass 5 found the freeform caller passing `"agent"` for `commandName`. That is fixed; both arguments now carry `record.agent.cli`, and the test pins main's wording again. Second, failure-text enrichment missing on a sibling path (one-shot, activity line, review, `lastFailureLine`, Settings test). Every path I found now calls `enrichAgentFailureDetail`. Passes 1 and 2 also left the Agents shot wrong, and that is still unfixed. A human should look at this recurring pattern before sign-off.

## Verdict
good to go — pass-5 freeform wording regression is fixed; EVIDENCE-GAP-ONLY: the declared Agents shot does not show the Copilot card.

## Relevance
still relevant — `main` still maps `default` and `copilot-auto-efficiency` to `efficiency` (`src/server/agents.ts:3446`, `src/core/agent-contract.ts:692-694`, `:902`), and this branch moves them to `balance`.

## Evidence
- `default-1.png` (label "GitHub Copilot Auto · Balance default on Agents", `/agents`, target `default`): the route matched and the capture is not blank, and it is current (tested tree `dcbedb93a`; later commits are bookkeeping only). But the frame shows only the pm, engineer and reviewer cards. No Copilot card is on screen, so "Auto · Balance" is not visible. The label comes from `labelForModel` in `src/ui-app/src/stores/config.ts`, which no test covers. Recapture with the copilot agent in frame, or retarget the highlight, before treating the visual claim as proven.

## Bugs
None found

## Edge cases
- `src/server/agents.ts:10061-10062`: `exitCause` slices to 240 characters after enrichment. The Copilot guidance is 271–296 characters, so the trailing "RepoOS maps default…" sentence is cut. Cosmetic only.
- `oneShotFailureDetail` enriches only the last three stderr lines. A tier error earlier in stderr goes unrecognised.
- Call sites `lastFailureLine` (`agents.ts:10747`) and `escalateFailedExit` (`:10868`) skip enrichment when `session` is undefined.
- `providerFailureDetail` consumers (`agents.ts:9704`, `:10061`, `:10196`, `:10207`) still carry raw text. They are latent: `scrapeProviderFailure` does not match the tier text, and the fallback branch goes through `lastFailureLine`.
- No bare `node`, `npm` or `npx` in the added lines.
- Landing checklist facts taken as given: merge WARN on the task file only. Not re-run.

## Suggestions (non-blocking)
- Recapture `default-1.png` (see Evidence).
- Add a test for `labelForModel("default", "github copilot")`.
- Make the `cli` parameter of `oneShotFailureDetail` required so a future caller cannot skip enrichment (pass 5, still open).
- Acceptance 3 is not implemented. Add one sentence to `docs/architecture.md` (~line 380) saying RepoOS does not probe tiers and the CLI error is the source of truth.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T21:52:13.638Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.


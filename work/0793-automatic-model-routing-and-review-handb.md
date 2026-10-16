---
id: "0793"
title: Automatic model routing and review handback re-evaluation
type: feature
status: review
priority: p2
area: [agent, server, core, web]
depends_on: ["0792"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/automatic-model-routing-and-review-handb
created_at: "2026-10-15T07:47:32Z"
updated_at: "2026-10-16T02:11:18Z"
---
## Problem
After #0792 lands (adapter, config, UI and shadow mode), the router still does not influence any run. This task adds opt-in automatic routing for PM, engineer and reviewer runs, plus re-evaluation when review sends work back. It must stay inside the existing lifecycle: review, checks, approval, close-out and the recovery work in #0767 are not bypassed or duplicated.

Parent/context record: #0791. Depends on #0792.

## Scope
- Opt-in `automatic` mode, invoked before PM, engineer and reviewer runs. Including PM flows that create a task before a task ID exists.
- Route a complete valid configuration (harness/CLI + model + supported reasoning), never independent fields that could form an invalid pair. Reuse `resolveAgentForTask`, `resolveReviewerForTask` and `mergeAgentOverride` for canonical role resolution.
- Explicit human pins are honored first. Router decisions are stored separately from human overrides so future rounds can be reconsidered.
- Deterministic filtering (already in `src/core/model-routing/candidates.ts`) is applied on every decision: budget allowlist, role/tool capability, installed and authenticated harness, context support and known availability. The router cannot expand permissions or budgets.
- Safe fallback or block on no candidates, provider failure, timeout, malformed response or insufficient evidence. Never select a forbidden pair; never silently disable review.
- **OpenRouter-backed decision models** use the same provider-agnostic contract and policy boundaries as direct Jev/Clef; only endpoint, credential env and model id differ.
- Bounded context brief: task/input/story, role, scope/risk, current diff for review, prior findings and attempts, and relevant historical results. Treat task and code text as data, not as instructions that change routing policy.
- Persist each decision (candidate set, selection, factors, provider/model, timing, fallback reason) and link it to the run's session accounting. Use `recordOneShotSession` for any one-shot decision call (taskId as appropriate, sessionType not `pm`).
- Re-evaluate on review handback using the actual findings and attempt history, comparing continuing the existing session with switching or escalating. Do not penalize a coding model for infrastructure, provider or gate-setup failures. Bound retries and escalations. Respect pause, locks and live-run coordination.
- Coordinate with #0767 centralized recovery. Do not introduce a competing recovery loop.
- Docs and user-docs: all three provider options, secret handling, shadow evaluation, automatic mode, fallbacks and limitations (updating the `[model_routing]` section under #0791).

## Acceptance criteria
- Automatic mode respects pins, role capabilities and allowlists for PM, engineer and reviewer; covered by tests for empty and singleton candidate sets, unavailable providers, invalid or low-confidence responses, timeouts, unknown costs, and restart-safe decision records.
- A review-handback scenario shows continuation versus escalation using findings and attempt history, with bounded retries and correct classification of infrastructure failures.
- No bypass of review, checks, approval or close-out. No mutation of a reviewed worktree.
- Fixture-backed tests only. No live paid evaluation, no credentialed calls.
- `repoos check` passes and the UI (if touched) is rebuilt.

## Out of scope
- Live or credentialed verification against Jev or Clef-Flash (see the separate human-only verification task).
- Fine-tuning, a full bandit optimizer, and the evaluation/replay harness beyond what the shadow records enable.
- Third-party registration or key provisioning.

## Notes for AI
- Start from `src/core/model-routing/decide.ts` (`decideRoutingForRun`) and wire it at the resolver call sites, behind `mode`, so `off` and `shadow` stay identical to today.
- Keep the decision logic in code; the provider returns signals only.

## Desired UX
On the Model routing section, show for each recent run whether automatic routing applied, the configuration chosen, and the fallback or block reason when it did not apply. Show shadow recommendations next to the actual selection. Render explanations only from recorded factors. Use the shared dropdown and dialog components and existing design tokens. The screen should not read as a log dump.

## Shots
```json
[
{
"label": "Model routing tab: recent routing decisions",
"target": "default",
"route": "/agents?tab=model-routing",
"highlight": "[data-testid=\"model-routing-panel\"]"
}
]
```

## Activity

- 2026-10-15T07:47:32Z · created · njachowski@gmail.com
- 2026-10-15T07:47:33Z · needs_input
- 2026-10-15T07:47:38Z · body
- 2026-10-15T08:23:20Z · body: section Scope
- 2026-10-15T09:47:14Z · needs_input
- 2026-10-15T11:02:07Z · status inbox→ready
- 2026-10-16T00:43:34Z · status ready→active, branch
- 2026-10-16T00:57:20Z · body
- 2026-10-16T00:58:29Z · body
- 2026-10-16T00:59:26Z · body: section Shots
- 2026-10-16T01:01:27Z · body
- 2026-10-16T01:03:19Z · body
- 2026-10-16T01:19:37Z · message_queued at 2026-10-16T01:19:37.909Z
- 2026-10-16T01:19:38Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-16T01:56:10Z · body
- 2026-10-16T01:57:47Z · body
- 2026-10-16T01:59:53Z · body
- 2026-10-16T02:02:51Z · body
- 2026-10-16T02:10:19Z · status active→review
- 2026-10-16T02:11:18Z · note: review pass 1: good to go

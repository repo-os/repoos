---
updated_at: "2026-10-17T05:34:53Z"
review_passes: 1
id: "0812"
title: "Decision model inputs: model facts, project history, task progress, and a clear objective"
type: feature
status: review
priority: p2
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/decision-model-inputs-model-facts-projec
created_at: "2026-10-17T04:33:38Z"
---
## Problem
The decision model is often unsure ('insufficient evidence') because it is sent little: a brief capped at 6,000 characters, three yes/no-style questions, and a choice among candidates that are labelled only 'cli / model / reasoning'. It is not told what to optimise for. Its context window is much larger than what we send, and we don't read that window from the provider.

Also: 'reasoning' is only meaningful for harnesses that expose a reasoning level (for example codex). Most candidates have none set, so the label should say so rather than show an empty field.

## Desired UX
- Budget the brief to the decision model's real context window: look up that window from the provider's model metadata and use a fixed share of it, not a fixed 6,000 characters. Keep a safe fallback when the lookup fails.
- Per candidate, add facts the decision can use: price per million input and output tokens, effective cost (with OpenRouter caching where available), context size, and whether it is subscription or pay-as-you-go. Source the prices and context size from provider metadata; keep any benchmark data in a curated, dated file in the repo.
- Per candidate, add that project's history: success and failure rate for the role, average tokens, turns, cost, and review passes, read from the project's own sessions data (not repoos's).
- Add task progress: engineer and review rounds so far, the latest review verdict, diff size (files and lines changed), whether UI shots are involved, and time open.
- State the objective in the question: choose the candidate that completes this kind of task well in the fewest rounds, at the lowest cost that still meets that bar. Say what 'well' means (the review passes first time).
- Show 'reasoning' only when the candidate has a real reasoning level, otherwise omit it.

## Acceptance criteria
- Test: the brief uses up to the configured share of the decision model's context window, and falls back to a safe fixed size when the window is unknown.
- Test: each candidate carries its price, context size and project history when known, and omits fields that are unknown.
- Test: the objective text is in the decision question.
- Test: a candidate with no reasoning level shows no reasoning field.
- Each decision logs the brief size and the facts it used, so a result can be explained later.
- No change to who is allowed to run; the allowlist and pins still apply first.

## Notes for AI
Start from src/server/model-routing-wiring.ts (buildRoutingBrief, MAX_ROUTING_BRIEF_CHARS), src/core/model-routing/decide.ts (buildRoutingQuestions), src/core/model-routing/candidates.ts (candidate and harness facts) and the sessions data in src/server/agents.ts. Keep the decision bounded: fixed questions, a short explanation, no free-text action from the model. Depends on #0811 for the readable result cards. Source: user request 2026-10-17.

## Activity

- 2026-10-17T04:33:38Z · created · njachowski@gmail.com
- 2026-10-17T04:50:48Z · status inbox→ready
- 2026-10-17T04:50:52Z · status ready→active, branch
- 2026-10-17T05:02:34Z · body
- 2026-10-17T05:05:37Z · body
- 2026-10-17T05:18:50Z · message_queued at 2026-10-17T05:18:50.235Z
- 2026-10-17T05:18:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-17T05:24:56Z · body
- 2026-10-17T05:33:49Z · status active→review
- 2026-10-17T05:34:53Z · note: review pass 1: good to go


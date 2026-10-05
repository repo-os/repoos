---
id: "0676"
title: "Cost accounting: never estimate from raw token totals; exclude estimates from totals and guardrails"
type: bug
status: review
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/cost-accounting-never-estimate-from-raw-
created_at: "2026-10-05T16:58:34Z"
updated_at: "2026-10-05T20:59:30Z"
review_passes: 1
---
## Problem

The board showed $28.65 of engineer spend; $25.29 of that was ONE bogus row: a 32-second pi session (the run that ended on an OpenRouter HTTP 402) recorded with `costSource: estimate`, input/output tokens 0 and `totalTokens` 2.8M. `estimateCostUsd(tokens)` (src/server/agents.ts:539) is `tokens x $9 / 1M` (the average of Claude 3.5 Sonnet's input and output price) and is applied whenever a session has a token total but no reported cost (agents.ts:4405, agents.ts:6774, review.ts:127). `totalTokens` includes cache-read tokens, so for a cheap, heavily cached model (DeepSeek V4.1 Flash, ~$0.14/M input, ~$0.014/M cached) the estimate is ~1000x too high. Real provider-reported spend over 75 sessions was $3.36. A spend guardrail would have fired falsely and every later metric was poisoned.

## Desired UX

The Tokens tab and board totals only ever show numbers that are either provider-reported or clearly labelled unknown.

- No estimation from `totalTokens`. If a CLI reports no cost, store `costUsd = null`, `costSource = 'none'`.
- If an estimate is still wanted, price by model with separate input / cached / output rates from a small table, mark it `estimate` visibly in the UI, and EXCLUDE estimates from board totals and from any guardrail or alert.
- Sanity cap: drop an estimate larger than N x the same model's median per-session cost.
- Also: the Model providers panel shows `hasKey: false` for OpenRouter when the key lives in a harness auth store (e.g. pi's auth.json); let it read keys from harness stores or accept a key in `.env`.

## Acceptance criteria

- Unit tests: cache-heavy session with no reported cost yields null/unknown; extracted usage wins; totals exclude estimates; a regression test for the 2.8M-token case.
- UI shows 'unknown' distinctly. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 6, the bullet 'trust provider-reported usage only; treat any estimate as unknown'. In short: it becomes simply true of the product; reword accordingly. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Shots
```json
[
  {
    "label": "Dashboard AI usage panel: cost shows unknown when nothing was reported, totals exclude estimates",
    "target": "default",
    "route": "/",
    "highlight": ".usage-panel"
  },
  {
    "label": "Model providers tab: a provider key is read from a harness login store too",
    "target": "default",
    "route": "/agents?tab=providers",
    "highlight": ".mp-panel"
  }
]
```

## Activity

- 2026-10-05T16:58:34Z · created · unknown
- 2026-10-05T17:16:45Z · story
- 2026-10-05T17:16:46Z · body: section Story context
- 2026-10-05T17:32:21Z · body: section Docs follow-up
- 2026-10-05T18:04:02Z · status inbox→ready
- 2026-10-05T18:04:12Z · status ready→active, branch
- 2026-10-05T18:15:32Z · body: section Shots
- 2026-10-05T18:26:56Z · status active→review
- 2026-10-05T20:59:30Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review

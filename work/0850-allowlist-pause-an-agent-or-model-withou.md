---
id: "0850"
title: "Allowlist: pause an agent or model without removing it (with optional resume date and reason)"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p1
area: [core, server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/allowlist-pause-an-agent-or-model-withou
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
review_cli_override: pi
review_model_override: openrouter/openrouter/free
created_at: "2026-10-19T12:22:44Z"
updated_at: "2026-10-19T16:03:55Z"
dev_error_count: 4
---
## Problem
Cursor ran out of credit on 2026-10-19 and will not be usable again for about three days. Today the only ways to stop RepoOS using it are to delete its row from `[[budget.allowlist]]` (losing the entry and the config) or to hand-edit overrides on every task. Starts, auto-dispatch, the CTO's restart/failover and the agent drivers keep trying `cursor`/`composer-2.5`, fail, and loop (tasks bounce between engineer restarts and connection errors). Providers and agents will come and go like this regularly (credits, rate limits, outages).

## Desired UX
Each allowlist entry (an agent CLI and its models, and each individual model) can be **paused** and **resumed** without being removed:
- A paused entry stays in the list, clearly marked (for example a "Paused" chip with the reason and "until <date>"), and is **never selected**: engineer/reviewer/PM/CTO defaults, auto-dispatch, task Start, the CTO's restart-stalled-agent failover, model routing and the agent drivers all skip it and fall back to the next available allowed pair (and say so in the activity log). If nothing allowed is available, a start fails with a clear "all allowed agents are paused" message instead of looping.
- Pause can be set for a whole agent (all its models) or for one model, with an optional **resume at** date/time and a free-text reason. When the resume time passes, the entry resumes automatically (and the Reminders feature may nudge you); a manual resume is always available.
- Existing per-task overrides that pick a paused pair keep working only if the human set them explicitly in the UI; an AI driver's override of a paused pair is refused with the same message as an off-allowlist pair.
- Controls live in the existing **Budget Controls** panel on the Agents page (Settings control per the repo rule), with clear copy, using the shared styled dropdown/dialog/date components.
- `repoos override --help` and the CLI show paused pairs as paused, and `repoos agents pause|resume <agent> [--model m] [--until <date>] [--reason "..."]` exists for drivers.

Config shape (documented in docs and `getConfigSchema()`): rows in `[[budget.allowlist]]` gain optional `paused = true`, `pausedUntil = "<ISO date>"`, `pausedReason = "..."`, and per-model pausing either as a `pausedModels` list or an equivalent structure; unknown keys are ignored and old configs parse unchanged.

## Acceptance criteria
- Tests: a paused agent/model is skipped by dispatch, Start, failover and the drivers; the chosen fallback and the reason are recorded; with all pairs paused a start fails with a clear message; an expired `pausedUntil` auto-resumes without a restart.
- Tests: the config parser round-trips the new keys, ignores unknown ones, and old configs behave exactly as before; `repoos agents pause/resume` writes the config and the Budget Controls UI reflects it live.
- UI: Budget Controls shows paused rows with chip, reason and resume date; pause/resume works from the UI with the shared components; light and dark checked; declared shots use a real fixture (add a `budget:paused` fixture if needed) and every PNG is opened.
- docs/agent-run-operations.md (or the allowlist doc), user-docs/configuration.md and AGENTS.md's 'Agent drivers pick from the budget allowlist' paragraph are updated.
- No new runtime dependency.

## Notes for AI
Start from src/core/budget-allowlist.ts (`agentModelAllowRows`), src/core/config.ts (~line 1870), src/ui-app/src/components/BudgetControlsPanel.vue, and wherever the CTO failover and `repoos override` pick pairs (grep restart-stalled-agent and `override`). This changes how every engineer start picks an agent: keep the default behaviour identical when nothing is paused, and fail closed (never silently pick a paused pair). Do not touch repoos.toml. Source: Nick, 2026-10-19 (cursor credits exhausted for ~3 days).

## Shots
```json
[
{
  "label": "Budget Controls: paused agent row and paused model with reason and resume date",
  "target": "default",
  "route": "/agents?tab=budget-controls",
  "highlight": "[data-testid=\"budget-list\"]",
  "state": "budget:paused"
}
]
```

## Activity

- 2026-10-19T12:22:44Z · created · njachowski@gmail.com
- 2026-10-19T12:22:45Z · needs_input
- 2026-10-19T12:22:52Z · body: Acceptance criteria (added 2, removed 2)
- 2026-10-19T12:22:55Z · needs_input
- 2026-10-19T13:19:02Z · review_cli_override, review_model_override
- 2026-10-19T13:19:05Z · review_model_override
- 2026-10-19T13:19:06Z · status inbox→ready
- 2026-10-19T13:19:09Z · status ready→active, branch
- 2026-10-19T13:30:05Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-19T13:38:14Z · body
- 2026-10-19T13:42:28Z · body
- 2026-10-19T13:44:50Z · body
- 2026-10-19T13:49:25Z · body
- 2026-10-19T13:56:19Z · body
- 2026-10-19T13:59:29Z · body
- 2026-10-19T14:00:18Z · body
- 2026-10-19T14:18:44Z · body
- 2026-10-19T14:24:59Z · body
- 2026-10-19T14:25:51Z · body
- 2026-10-19T14:31:27Z · body
- 2026-10-19T14:49:26Z · body
- 2026-10-19T15:06:39Z · cli_override, model_override
- 2026-10-19T15:06:44Z · needs_input
- 2026-10-19T15:08:01Z · body
- 2026-10-19T15:08:47Z · cli_override, model_override
- 2026-10-19T15:10:21Z · body
- 2026-10-19T15:16:10Z · message_queued at 2026-10-19T15:16:10.135Z
- 2026-10-19T15:16:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T15:27:25Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-19T15:27:25Z · message_delivered: 1 message(s)
- 2026-10-19T15:27:27Z · note: stopped orphaned engineer pid 97978
- 2026-10-19T15:39:42Z · body
- 2026-10-19T15:49:16Z · body
- 2026-10-19T15:50:59Z · body
- 2026-10-19T16:03:55Z · body

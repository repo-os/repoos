---
id: "0327"
title: "Add \"Model providers\" tab to Agents page"
type: feature
status: review
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/add-model-providers-tab-to-agents-page
created_at: "2026-09-05T04:02:45Z"
updated_at: "2026-09-05T08:35:57Z"
dev_error_count: 1
---
## Problem

We want a way to see model-provider spend/credit info without leaving RepoOS.
Right now that means opening each provider's own dashboard by hand. Several
providers expose this over API; a few don't.

## Desired UX

A new "Model providers" tab on the Agents page, alongside the existing
per-agent config. One row per provider, scoped to these four for v1:

- **OpenRouter** — live data. `GET /api/v1/credits` (total_credits -
  total_usage = remaining) and `GET /api/v1/key` (daily/weekly/monthly spend +
  rate limits) both work off an API key. Needs a key.
- **opencode Go** — live, but partial. `GET /zen/go/v1/usage` returns rolling
  usage windows (e.g. % of this window consumed), not a dollar/credit balance
  — there is no wallet-balance endpoint for Go or Zen as of this writing.
  Needs a key.
- **opencode Zen** — no public balance API (open upstream feature request,
  unresolved). Render this row as a dashboard link-out, not live data.
- **DeepInfra** — no public billing/usage API found. Dashboard-only. Render
  as a dashboard link-out.

For the two "needs a key" providers (OpenRouter, opencode Go), add a small
inline form on that row to paste the key — do NOT try to read it out of
opencode's own config/auth store (unstable format, not a public contract,
would couple us to opencode's internals). Save it to RepoOS's own
gitignored config the same way other local secrets are handled (see how the
dev backdoor code / other env-based secrets are read in `src/core/config.ts`
— follow that existing pattern rather than inventing a new one). Never commit
these keys; never log them.

For the two "no API" providers (opencode Zen, DeepInfra), the row is just a
label + "Open dashboard ↗" link to the provider's billing/usage page. No key
collection, no live number, no polling.

## Explicit non-goals for this task

- Claude Code (Pro/Max subscription %) and Codex (ChatGPT Plus/Pro
  subscription %) are OUT of scope — neither exposes a public API for
  remaining subscription quota; that data only exists inside an interactive
  CLI session (`/usage`, `/status`, `/cost`) and isn't fetchable externally.
  Do not attempt to scrape or reconstruct it from RepoOS's own sessions-table
  usage log — that log is RepoOS's own metering of what RepoOS itself sent,
  not the account-wide subscription quota (which also includes usage from
  claude.ai, ChatGPT web, and other tools RepoOS can't see). If a future task
  wants to surface RepoOS's own recorded spend per agent, that's a different,
  separate feature — don't fold it into this one under the same label.
- No auto-refresh/polling loop is required for v1 — a manual refresh button
  per row is enough. Revisit polling cadence only if this ships and someone
  asks for it.
- Adding more providers beyond these four is a follow-up, not this task.

## Notes

- Zero runtime dependencies is a hard constraint (see AGENTS.md) — implement
  the OpenRouter/opencode-Go calls with a plain `fetch`, no new SDK/client
  library.
- Nav entry lives in `src/ui-app/src/nav.ts`; the Agents page view and its
  existing tabs are the place to add a new tab, not a new top-level route.

## Activity

- 2026-09-05T04:02:45Z · created · unknown
- 2026-09-05T04:10:58Z · status inbox→ready
- 2026-09-05T04:11:43Z · status ready→active, branch
- 2026-09-05T04:19:11Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-09-05T06:38:05Z · needs_input
- 2026-09-05T08:35:57Z · status active→review

---
id: "0707"
title: "Provider balances in Settings are stale: show a fresh balance with an as-of time and a Refresh that gives feedback"
type: bug
status: inbox
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T04:40:52Z"
updated_at: "2026-10-06T04:41:05Z"
---
## Problem

On 2026-10-06 the owner's DeepInfra balance went from $10.00 to $8.36 during the day, but the Settings / model-providers API and UI did not show the up-to-date balance (it lagged or showed an older figure). After adding $10 to OpenRouter the same day there is likewise no visible confirmation in the app. Without a fresh balance there is no way to compare provider-reported spend with what the provider has actually charged, and the board's spend threshold (#0687) cannot be trusted.

## Desired UX

- The providers panel shows the balance (or remaining credit) with an "as of <time>" stamp, a visible Refresh with loading / success / failure feedback, and a clear "not supported by this provider" state when a provider has no balance API.
- A balance that changes between refreshes (a top-up, spend) is picked up without a server restart; stale values are labelled stale.
- A configurable low-balance alert feeds the attention queue (#0687).

## Acceptance criteria

- Tests: balance refresh updates the displayed value and timestamp; provider without a balance API shows the unsupported state; refresh failure is surfaced. Docs updated (user-docs/agents.md). repoos check passes.

## Notes for AI

Read src/server/routes/model-providers.ts and the ModelProvidersPanel component first; check how balance is fetched and cached today and where the stale value comes from (cache TTL, startup-only fetch, or missing endpoint). Evidence: owner report 2026-10-06 (DeepInfra $10 -> $8.36 not reflected).

## Activity

- 2026-10-06T04:40:52Z · created · unknown
- 2026-10-06T04:41:05Z · story

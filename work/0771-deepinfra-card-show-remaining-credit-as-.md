---
id: "0771"
title: "DeepInfra card: show remaining credit as the headline number"
type: bug
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/deepinfra-card-show-remaining-credit-as-
cli_override: codex
model_override: gpt-6-luna
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-13T17:02:59Z"
updated_at: "2026-10-13T17:22:31Z"
---
## Problem
The DeepInfra provider card shows two money figures that look like they conflict:
- Big number: AVAILABLE CREDIT $9.94
- Small box: SINCE LAST INVOICE $7.13

The DeepInfra billing page shows PREPAID CREDITS $2.81 and MONTHLY USAGE $7.13. The difference between the card's two numbers is $9.94 - $7.13 = $2.81, which is exactly the remaining prepaid credit. So the card is showing a balance that does not match what the user has left. The big number should be the remaining credit.

Also: the card showed 'Usage unavailable: The operation timed out.' while the balance loaded, and its 'As of' timestamp (Oct 13, 11:59 PM) was not clearly marked as stale.

## Desired UX
- Headline (big number): remaining credit (here $2.81), labelled clearly, e.g. 'Remaining credit'.
- Secondary: spend since last invoice ($7.13), with the monthly limit if one is set.
- If the usage call times out, keep the last good figures and mark them as stale with their timestamp, rather than showing a blank or a mismatch.

## Acceptance criteria
- Verify the remaining-credit formula against DeepInfra's own billing API response (the fields behind the billing page's Prepaid Credits), not just the subtraction. Document which field is used.
- Headline shows remaining credit; labels match the DeepInfra billing page names.
- Timeout keeps the last good values, shows a stale marker and time, and does not show an error as the main figure.
- Test: unit test for the formula and the stale/timeout rendering.
- Checked in light and dark themes; contrast audit stays green.

## Notes for AI
Start from the provider card for DeepInfra and its billing fetch on the server (grep DeepInfra billing). Do not hard-code the figures from this screenshot in tests beyond the formula example. Source: user report, 2026-10-14.

## Activity

- 2026-10-13T17:02:59Z · created · njachowski@gmail.com
- 2026-10-13T17:22:16Z · status inbox→ready
- 2026-10-13T17:22:22Z · cli_override, model_override
- 2026-10-13T17:22:24Z · model_override
- 2026-10-13T17:22:29Z · review_cli_override, review_model_override
- 2026-10-13T17:22:31Z · status ready→active, branch

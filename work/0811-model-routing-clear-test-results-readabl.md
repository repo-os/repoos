---
id: "0811"
title: "Model routing: clear test results, readable decision cards, plain fallback reasons"
type: feature
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T04:20:42Z"
updated_at: "2026-10-17T04:20:42Z"
---
## Problem
1. 'Test live connection' only shows one line ('Live decision call succeeded.'). The user can't see what was asked, what came back, which model answered, how long it took, or what it cost. It also gives no feedback while waiting.
2. Recent decisions show 'Fallback: insufficient-evidence', which reads like an error. It means the model's answer was not confident enough to use: the top probability for an eligible candidate is below the minimum confidence, or the model's own confidence is low, or it named a candidate that isn't eligible (src/core/model-routing/policy.ts, hasSufficientEvidence). The fallback is the configured role default, so nothing breaks, but the card doesn't say so.
3. Decision cards show little. Response time and cost are not on the main card, even when available. The request and response details are not available to expand.

## Desired UX
- Test live connection: a waiting state with an animation while the call runs. Then a result card below the button, with a green outline on success and a red outline on failure. The card shows: the test question asked, the answer returned (with the probability for each option where the provider gives one), the model that answered, the response time, and the cost when the provider reports usage. On failure it shows the plain-language reason and what to check.
- Recent decisions: each card always shows the chosen agent and model, the recommended one, the response time, and the cost (when known). The chosen answer's probability is shown on the card when present.
- Fallback reasons are plain words with a short explanation. For insufficient-evidence: 'The model was not confident enough, so the role default was used', with the top probability and the threshold. Not styled as an error.
- Each decision card has an expandable details area, collapsed by default, with the question sent and the answer received.

## Acceptance criteria
- Test: a successful live test shows a green card with the question, answer, model, time and cost; a failed test shows a red card with the reason.
- Test: an insufficient-evidence decision shows the plain explanation with the top probability and threshold.
- Test: each decision card shows response time and cost when recorded, and hides details until expanded.
- The waiting animation is shown while a test runs and respects reduced-motion settings.
- Light and dark themes checked on both card types.

## Notes for AI
Start from ModelRoutingPanel.vue (Test live connection, Recent decisions) and runtime.ts (the live probe and its result). The fallback reason strings are in policy.ts (failureReason, insufficient-evidence). Keep the probe call minimal and do not change how decisions are made. Source: user questions 2026-10-17 after model routing started working.

## Activity

- 2026-10-17T04:20:42Z · created · njachowski@gmail.com

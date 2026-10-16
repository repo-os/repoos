---
id: "0809"
title: "Model routing: OpenRouter uses the saved Model providers key, consistent status, plain 'OpenRouter' label"
type: bug
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-16T11:59:41Z"
updated_at: "2026-10-16T11:59:41Z"
---
## Problem
After #0803 landed, three things are wrong on the Model routing page:
1. The status is inconsistent. It shows 'OpenRouter key: NOT SET' and 'Provider ready: Ready' at the same time. The routing status reads the key through a different path than the Model providers tab (src/core/model-routing/runtime.ts, readRoutingCredential and credentialLabelFor), so it does not see the key saved there. The user had saved the OpenRouter key on Model providers and expected it to show as set and ready.
2. The decision-provider option reads 'OpenRouter (Jev and Clef models)'. It should read just 'OpenRouter'. OpenRouter offers many decision models, so the label must not list any.
3. OpenRouter routing should not ask for a key on the routing page at all. It uses the key already saved on the Model providers tab (REPOOS_OPENROUTER_API_KEY).

## Desired UX
- The routing status and the Model providers tab agree: if the OpenRouter key is saved there, routing shows it as set and Ready, in one consistent status.
- The option reads 'OpenRouter'. No model names in the label.
- OpenRouter shows no key field on the routing page; it links to Model providers when the key is missing.

## Acceptance criteria
- Test: with the OpenRouter key saved on Model providers, the routing status reports the key as set and provider ready, and the two pills agree.
- Test: with no key saved, the routing status reports 'not set' and provider not ready, and it links to Model providers.
- Test: the decision-provider option label is 'OpenRouter'.
- Light and dark themes checked on the status.

## Notes for AI
Start from src/core/model-routing/runtime.ts (readRoutingCredential, credentialLabelFor, modelRoutingStatus), the Model providers key path in src/server/routes/model-providers.ts, and src/ui-app/src/components/ModelRoutingPanel.vue (the status pills and the provider option labels). Tests use fake values only. Source: user report 2026-10-16 after #0803 landed.

## Activity

- 2026-10-16T11:59:41Z · created · njachowski@gmail.com

---
id: "0809"
title: "Model routing: Jev and OpenRouter only (hide Clef-Flash), OpenRouter uses the saved key, consistent status, plain 'OpenRouter' label"
type: bug
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/model-routing-jev-and-openrouter-only-hi
created_at: "2026-10-16T11:59:41Z"
updated_at: "2026-10-16T12:11:54Z"
---
## Problem
After #0803 landed, three things are wrong on the Model routing page, and one scope change is needed:
1. The status is inconsistent. It shows 'OpenRouter key: NOT SET' and 'Provider ready: Ready' at the same time. The routing status reads the key through a different path than the Model providers tab (src/core/model-routing/runtime.ts, readRoutingCredential and credentialLabelFor), so it does not see the key saved there.
2. The decision-provider option reads 'OpenRouter (Jev and Clef models)'. It should read just 'OpenRouter'. OpenRouter offers many decision models, so the label must not list any.
3. OpenRouter routing should not ask for a key on the routing page at all. It uses the key already saved on the Model providers tab (REPOOS_OPENROUTER_API_KEY).
4. Self-hosted Clef-Flash is not shipped. The adapter exists with fixture tests, but there is no live verification and no real user path. It must not appear as a choice. Only Jev and OpenRouter are offered.

## Desired UX
- The decision-provider choices are exactly 'TypeSafe Jev (direct)' and 'OpenRouter'. Clef-Flash is not shown: no option, no server address field, no server token field, and no Clef-Flash description text on the routing page.
- The routing status and the Model providers tab agree: if the OpenRouter key is saved there, routing shows it as set and Ready, in one consistent status.
- OpenRouter shows no key field on the routing page; it links to Model providers when the key is missing.
- Jev keeps its masked key field, saved only on Save, to the same .env path as Model providers.

## Acceptance criteria
- Test: the decision-provider options are exactly Jev and OpenRouter, with OpenRouter labelled plainly.
- Test: with the OpenRouter key saved on Model providers, the routing status reports the key as set and provider ready, and the two pills agree.
- Test: with no OpenRouter key saved, the status reports not set and not ready, and links to Model providers.
- Test: the Jev key field is masked, has a real placeholder, and saves only on Save.
- The Clef-Flash adapter code and its fixture tests are kept but not selectable in the UI. Its config key is not documented as available.
- Light and dark themes checked on the status.

## Notes for AI
Start from src/core/model-routing/runtime.ts (readRoutingCredential, credentialLabelFor, modelRoutingStatus), src/ui-app/src/components/ModelRoutingPanel.vue (the provider options around line 34, showClefUrl, showsKeyForm), src/core/model-routing/config.ts (ROUTING_PROVIDERS) and the Model providers key path in src/server/routes/model-providers.ts. Keep the Clef-Flash schema value so existing configs still parse, but hide it from the UI. Tests use fake values only. Source: user report 2026-10-16.

## Activity

- 2026-10-16T11:59:41Z · created · njachowski@gmail.com
- 2026-10-16T12:07:34Z · title, body
- 2026-10-16T12:11:51Z · status inbox→ready
- 2026-10-16T12:11:54Z · status ready→active, branch

---
id: "0803"
title: "Model routing: take the Jev / Clef-Flash key the same way Model providers does"
type: bug
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys)"
priority: p1
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-16T03:11:27Z"
updated_at: "2026-10-16T03:11:44Z"
---
## Problem
The Model routing page asks for an 'API key variable' as free text. Users paste the secret itself into that field, which is confusing and unsafe: the field saves on every character typed, the secret ends up in repoos.toml (model_routing.credentialEnv), and the server commits repoos.toml. The test buttons do nothing because the provider is never ready. The field's placeholder is also shown as real text, so deleting it saves immediately.

The Model providers page already handles secrets safely (src/server/routes/model-providers.ts): a masked input, saved only to the gitignored .env under a fixed env-var name from a registry, never written to repoos.toml, never logged, and never echoed back (rows only show whether a value is set).

## Desired UX
- Model routing uses the same save path as Model providers. The user picks the provider (Jev, Clef-Flash, OpenRouter), pastes the value into a masked field with a real placeholder, and clicks Save. Nothing saves while typing.
- The env-var name is fixed per provider and not shown as an editable field. The page shows 'Saved' or 'Not set' only.
- Remove the free-text 'API key variable' field, or move it to an advanced note.
- Test configuration and Test live connection show a clear result in plain language: what is missing, or the live response.
- Provider ready turns on when a value is saved and the provider is selected.

## Acceptance criteria
- Jev, Clef-Flash and OpenRouter (routing) are registered in the model-providers registry with fixed env-var names, so they share the same save path.
- Saving a value does not change repoos.toml or any tracked file. A test checks this using a fake placeholder value.
- The input is masked, uses a real placeholder attribute, and saves only on the Save action.
- After saving, the page shows Saved and Provider ready updates without a reload.
- Test buttons report the result in the UI, including the not-set case.
- Light and dark themes; keyboard accessible.

## Notes for AI
Start from src/server/routes/model-providers.ts (registry, the .env writer, the save route) and src/ui-app/src/components/ModelProvidersPanel.vue (masked input form), then src/ui-app/src/components/ModelRoutingPanel.vue and model_routing.credentialEnv in src/core/model-routing/config.ts. Tests use fake values only. Source: user report 2026-10-16.

## Activity

- 2026-10-16T03:11:27Z · created · njachowski@gmail.com
- 2026-10-16T03:11:28Z · needs_input
- 2026-10-16T03:11:44Z · body

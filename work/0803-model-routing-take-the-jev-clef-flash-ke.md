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
updated_at: "2026-10-16T03:11:28Z"
---
## Problem
The Model routing page asks for an 'API key variable' as free text. Users paste the key itself into that field, which is confusing and unsafe: the field saves on every keystroke, the key ends up in repoos.toml (model_routing.credentialEnv), and the server commits repoos.toml. The test buttons do nothing because the provider is never ready. The field's placeholder is also shown as real text, so deleting it saves immediately.

The Model providers page already handles keys safely (src/server/routes/model-providers.ts): a masked key input, saved only to the gitignored .env under a fixed env-var name from a registry, never written to repoos.toml, never logged, and never echoed back (rows only show whether a key is set).

## Desired UX
- Model routing uses the same key path as Model providers. The user picks the provider (Jev, Clef-Flash, OpenRouter), pastes the key into a masked field with a real placeholder, and clicks Save. Nothing saves while typing.
- The env-var name is fixed per provider and not shown as an editable field. The page shows 'Key saved' or 'No key' only.
- Remove the free-text 'API key variable' field, or move it to an advanced note.
- Test configuration and Test live connection show a clear result: what is missing, or the live response, in plain language.
- Provider ready turns on when a key is saved and the provider is selected.

## Acceptance criteria
- Jev, Clef-Flash and OpenRouter (routing) are registered in the model-providers registry with fixed env-var names, so they share the same save path.
- No key value is written to repoos.toml or any tracked file; a test checks that saving a key does not change repoos.toml.
- The key field is masked, uses a real placeholder attribute, and saves only on Save.
- After saving a key, Credential shows 'Key saved' and Provider ready updates without a reload.
- Test buttons report the result in the UI, including the no-key case.
- Light and dark themes; keyboard accessible.

## Notes for AI
Start from src/server/routes/model-providers.ts (registry, setDotEnvSecret, the key route) and src/ui-app/src/components/ModelProvidersPanel.vue (masked key form), then src/ui-app/src/components/ModelRoutingPanel.vue and the routing config (model_routing.credentialEnv in src/core/model-routing/config.ts). Existing tests: the model-providers route tests. Source: user report 2026-10-16 after a key was pasted into the variable field.

## Activity

- 2026-10-16T03:11:27Z · created · njachowski@gmail.com
- 2026-10-16T03:11:28Z · needs_input

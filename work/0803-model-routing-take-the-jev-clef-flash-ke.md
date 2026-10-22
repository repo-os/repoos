---
id: "0803"
title: "Model routing: take the Jev / Clef-Flash key the same way Model providers does"
type: bug
status: done
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: e42ab167
priority: p1
area: [web, server]
merged_commit: "03c8bbe49dad75293cedc09d93f2e0146c590654"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/model-routing-take-the-jev-clef-flash-ke
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-16T03:11:27Z"
updated_at: "2026-10-22T07:47:45Z"
last_close_out_gate_ms: 103604
last_close_out_gate_at: "2026-10-16T09:38:35.201Z"
review_passes: 1
dev_error_count: 5
---
## Problem
The Model routing page is confusing and asks for things users don't need to supply:
1. It asks for a free-text 'API key variable'. Users paste the secret into it, which saves into repoos.toml (model_routing.credentialEnv) and gets committed by the server. Saving also happens on every character typed, and the placeholder is shown as real text.
2. It lists 'OpenRouter (System One)' as if it needed a different key. It doesn't: the OpenRouter adapter reads REPOOS_OPENROUTER_API_KEY, the same key saved on the Model providers page. 'System One' only names the request format.
3. It lists 'Self-hosted Clef-Flash' as if a cloud key were needed. The adapter calls a self-hosted SGLang server at a base URL, with an optional bearer token. No Cloudflare key is used. A Cloudflare-hosted Clef-Flash would need its own account setup and is not built.

The Model providers page already saves secrets safely (src/server/routes/model-providers.ts): a masked input, saved only to the gitignored .env under a fixed name, never written to repoos.toml, never logged, never echoed back.

Incident: a Jev key was pasted into the variable field, saved to repoos.toml and committed locally (f54341535). The key is deactivated. The commit was not pushed.

## Desired UX
- Provider choices, in plain words:
- TypeSafe Jev (direct): needs a Jev key. Entered through the same masked, save-only-on-Save path as Model providers, under a fixed env-var name. No free-text variable field.
- OpenRouter (Jev and Clef models): uses the OpenRouter key already saved on the Model providers page. No second key. If that key is missing, say so and link to Model providers.
- Clef-Flash (your own server): asks for the server address and an optional token. No cloud key. Only appears as a choice when that address is set, or with a clear 'set up your own server' note.
- Remove the free-text 'API key variable' field.
- Status reads Saved / Not set / Ready in plain words.
- Test configuration and Test live connection report the result in the UI, including what is missing.

## Acceptance criteria
- Jev is registered in the model-providers registry with a fixed env-var name, so it shares the save path. Saving a key does not change repoos.toml or any tracked file; a test checks this with a fake value.
- OpenRouter routing reads the existing OpenRouter key and shows no separate key field. A test covers the missing-key message.
- Clef-Flash asks only for the server address and optional token, and the optional token is saved through the same .env path.
- The input is masked, uses a real placeholder attribute, and saves only on Save. Provider ready updates without a reload.
- Light and dark themes; keyboard accessible.
- Docs: update the agent-facing docs (AGENTS.md and the docs/ folder) with a short how-to for building any feature that takes an API key. It must say: register the key in the model-providers registry with a fixed env-var name; write it only through the .env writer, never to repoos.toml or any tracked file; never make the env-var name a free-text field; show only saved or not-set status; use fake values in tests; and never paste a live key into a task, a chat or a config field. Include the incident above as the reason.

## Notes for AI
Start from src/server/routes/model-providers.ts (registry, the .env writer, the save route), src/core/model-routing/providers.ts (OpenRouter and Clef-Flash adapters), src/core/config.ts (REPOOS_OPENROUTER_API_KEY), src/ui-app/src/components/ModelProvidersPanel.vue and src/ui-app/src/components/ModelRoutingPanel.vue. Tests use fake values only. Source: user report 2026-10-16.

## Shots
```json
[
{
"label": "Model routing credentials UX",
"target": "default",
"route": "/agents?tab=model-routing",
"highlight": "[data-testid=\"model-routing-panel\"]",
"state": "board:withReviewTask"
}
]
```

## Activity

- 2026-10-16T03:11:27Z · created · njachowski@gmail.com
- 2026-10-16T03:11:28Z · needs_input
- 2026-10-16T03:11:44Z · body
- 2026-10-16T03:16:58Z · body
- 2026-10-16T03:21:50Z · body
- 2026-10-16T03:22:44Z · needs_input
- 2026-10-16T03:22:45Z · cli_override, model_override
- 2026-10-16T03:22:47Z · status inbox→ready
- 2026-10-16T03:22:49Z · status ready→active, branch
- 2026-10-16T03:22:50Z · needs_input
- 2026-10-16T03:28:24Z · message_queued at 2026-10-16T03:28:24.251Z
- 2026-10-16T03:28:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-16T05:04:24Z · needs_input
- 2026-10-16T05:04:25Z · needs_input
- 2026-10-16T05:04:27Z · message_expired: not delivered within timeout
- 2026-10-16T05:04:57Z · needs_input
- 2026-10-16T05:04:57Z · message_queued at 2026-10-16T05:04:57.891Z
- 2026-10-16T05:09:54Z · body
- 2026-10-16T05:10:43Z · body
- 2026-10-16T05:11:35Z · body: section Shots
- 2026-10-16T05:17:18Z · handoff failed · remote validation failed: test failure: tests/model-providers-routes.test.ts > GET /api/model-providers > lists all provider rows with hasKey booleans and never any key material on bee — fix it in the feature branch and re-run the gate
- 2026-10-16T05:25:40Z · message_delivered: 1 message(s)
- 2026-10-16T05:25:41Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/model-providers-routes.test.ts > GET /api/model-providers > lists all provider rows with hasKey booleans and never any key material on bee — fix it in the feature branch and re-run the gate
- 2026-10-16T05:25:44Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-16T05:48:43Z · message_queued at 2026-10-16T05:48:43.640Z
- 2026-10-16T05:48:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-16T05:54:26Z · message_delivered: 1 message(s)
- 2026-10-16T08:36:59Z · body
- 2026-10-16T08:45:37Z · body: section Shots
- 2026-10-16T08:46:29Z · body
- 2026-10-16T08:48:03Z · body
- 2026-10-16T08:55:36Z · status active→review
- 2026-10-16T08:56:47Z · note: review pass 1: good to go
- 2026-10-16T09:38:35Z · close-out gate completed in 104s
- 2026-10-16T09:39:42Z · status review→done, release:success
- 2026-10-16T12:25:06Z · needs_input
- 2026-10-22T07:47:45Z · needs_input

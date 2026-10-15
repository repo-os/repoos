---
id: "0792"
title: "Model routing adapter, config and shadow mode"
type: feature
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys)"
priority: p2
area: [agent, server, core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-15T07:47:16Z"
updated_at: "2026-10-15T07:47:17Z"
---
## Problem
Task #0791 introduced a provider-neutral routing foundation (adapters, candidate filter, policy, `[model_routing]` parsing) but nothing user-facing or run-path-facing is wired yet. This task delivers the adapter, configuration, mode and UI layer so a human can select a provider, see credential status, and choose `off` or `shadow` with confidence that shadow mode never changes a selection. Automatic routing is explicitly out of scope; it is task 2.

Parent/context record: #0791.

## Scope
- Keep and harden the provider-neutral decision adapter. Both TypeSafe Jev (`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer`, default `jev-latest`) and Cloudflare Clef-Flash (self-hosted `POST {baseUrl}/v1/systemone`, optional bearer) share one System One codec. Fixture-backed request/response tests for both adapters, covering success, auth, http, timeout, malformed and unknown-answer-type cases.
- `[model_routing]` documented in repoos.toml: `mode` (off|shadow), `provider`, `model`, `baseUrl`, `credentialEnv`, `roles`, `timeoutMs`, and the calibrated fallback policy. Every user-facing key exposed through `getConfigSchema()` and `SUPPORTED_TOML_KEYS` with a test.
- TOML and UI round-trip: a designed "Model routing" section on the Agents page (linked from Settings or Agents nav) with shared dropdowns and dialogs, provider selection (Jev / Clef-Flash), role controls, mode, timeout, fallback explanation, and help text. Persist and reload consistently with TOML.
- Credential visibility: show whether the configured `credentialEnv` variable is present and whether a connection test is possible. Never display, store or echo the key. A missing credential must be visible and must NOT break normal role execution (routing simply stays inactive).
- Test connection: a non-network-by-default probe (config and credential-presence check). An explicit live test button may exist, but it must not be exercised in automated tests.

## Acceptance criteria
- Both adapters sit behind the same contract; fixture tests pass for both; switching provider round-trips through TOML and the UI without code changes.
- Off mode preserves existing role selection (regression test). Shadow mode records a recommendation but never changes the actual role selection (test).
- Missing credentials are visible in the UI and do not break normal role execution.
- UI tests cover configuration persistence and display; rebuild the UI and verify with the shared UI tooling.
- Docs: `user-docs/configuration.md` section for `[model_routing]` (already drafted under #0791) is updated to match the shipped UI and keys.

## Out of scope (do not implement)
- Automatic mode, run-path invocation for PM/engineer/reviewer (that is task 2).
- Any live or credentialed call to Jev or Clef-Flash. No real key may be required by automated tests.
- Third-party account registration or secret setup. Do not request, create, or store secrets in repo files.
- Review-handback re-evaluation.

## Notes for AI
- Reuse the existing `budget-allowlist` and `agent-model-allowlist` enforcement; the router must never widen permissions.
- Secrets follow the existing `.env` / env-var convention (`setDotEnvSecret`); never write keys to repoos.toml.
- The foundation lives in `src/core/model-routing/` and `src/ui-app/tests/model-routing.test.ts`.

## Activity

- 2026-10-15T07:47:16Z · created · njachowski@gmail.com
- 2026-10-15T07:47:17Z · needs_input

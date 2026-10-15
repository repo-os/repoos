---
id: "0794"
title: Live verification of Jev and Clef-Flash routing (human-only)
type: chore
status: ready
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys)"
hold: true
priority: p2
area: [agent, server]
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-15T07:47:48Z"
updated_at: "2026-10-15T11:02:13Z"
---
## Problem
Routing for #0791 needs one credentialed smoke check against each real decision backend before anyone relies on it. Automated tests use fixtures only. Those checks require a human because they need third-party accounts, billing, a self-hosted GPU host, and secrets that an agent must never handle.

This task is independent of #0792 and #0793. It does not block either, and they do not block it. It is held and assigned to a human.

Parent/context record: #0791.

## Required accounts and setup (human)
1. **TypeSafe Jev (direct).** Optional if you use OpenRouter only. Generate an API key in the TypeSafe console. Record it only in `.env` as `TYPESAFE_API_KEY=...`.
2. **OpenRouter (recommended for Jev and Clef on OpenRouter).** Use `REPOOS_OPENROUTER_API_KEY` in `.env`. Verify Jev with `provider = "openrouter"` and a System One request once #0792 ships. For Clef models on OpenRouter, use the same provider with the OpenRouter model slug. **Cloudflare-direct self-hosted Clef remains deferred** until you have a GPU host and account.
3. **Cloudflare Clef-Flash (self-hosted, deferred).** When ready: SGLang on a GPU host, `provider = "clef-flash"`, `baseUrl`, optional `REPOOS_CLEF_FLASH_API_KEY`.
4. Pin a model id for reproducibility (e.g. `jev-latest`, `typesafe/jev-1.14`, or an OpenRouter Clef slug).

## Checks to run (human, once the setup above exists)
- **Jev:** one minimal System One request via **direct TypeSafe or OpenRouter** (noul + choice). Record HTTP status, returned `model`, and usage only.
- **Clef:** via OpenRouter when listed; otherwise note "Cloudflare-direct not run".
- **Missing keys:** with routing keys unset, confirm RepoOS shows not set and normal role execution still works.
- Record response-shape mismatches as follow-up bugs.

## Evidence rules
- Leave every measured or observed field blank until a human has run the check. Do not fill in results on anyone's behalf.
- Never include a key, token, or account identifier in the task body, transcripts, or commits.

## Out of scope
- Any code change. This task only verifies live behavior and records results.
- Automating credentialed calls in CI.

## Activity

- 2026-10-15T07:47:48Z · created · njachowski@gmail.com
- 2026-10-15T07:47:54Z · assigned_to
- 2026-10-15T08:23:22Z · body: section Required accounts and setup (human)
- 2026-10-15T08:23:23Z · body: section Checks to run (human, once the setup above exists)
- 2026-10-15T08:23:59Z · body: section Required accounts and setup (human)
- 2026-10-15T08:24:00Z · body: section Checks to run (human, once the setup above exists)
- 2026-10-15T11:02:13Z · status inbox→ready

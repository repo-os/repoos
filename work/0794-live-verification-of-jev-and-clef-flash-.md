---
id: "0794"
title: Live verification of Jev and Clef-Flash routing (human-only)
type: chore
status: inbox
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
updated_at: "2026-10-15T07:47:54Z"
---
## Problem
Routing for #0791 needs one credentialed smoke check against each real decision backend before anyone relies on it. Automated tests use fixtures only. Those checks require a human because they need third-party accounts, billing, a self-hosted GPU host, and secrets that an agent must never handle.

This task is independent of #0792 and #0793. It does not block either, and they do not block it. It is held and assigned to a human.

Parent/context record: #0791.

## Required accounts and setup (human)
1. **TypeSafe Jev.** Create or sign in to a TypeSafe account and generate an API key in the TypeSafe console (keys page). Confirm the key works in the TypeSafe playground first. Record the key only in your local gitignored `.env` as `TYPESAFE_API_KEY=...`. Do not paste it into this task, a commit, a chat, or any repo file.
2. **Cloudflare Clef-Flash (self-hosted).** Requires a GPU host able to run the 9B model (the model card was tested on a single H200). Serve it with SGLang per the model card, so that `POST <baseUrl>/v1/systemone` answers. Optionally protect it and set `REPOOS_CLEF_FLASH_API_KEY` in `.env`. Record the base URL you will use (for example an internal address), not any credential.
3. Confirm which Jev model id you will pin (for example `jev-latest` or a dated version) so the check is reproducible.

## Checks to run (human, once the setup above exists)
- Jev: send one minimal System One request (a noul question and one choice question) with the configured key. Expect a 200 response with `answers` keyed by question id. Record the HTTP status, the returned `model`, and the usage numbers only. Do not record the key.
- Clef-Flash: the same minimal request against the self-hosted server. Record the status and returned `model`.
- Missing credential: with `TYPESAFE_API_KEY` unset, confirm RepoOS reports the key as not set and normal role execution still works.
- Record any mismatch between the documented and observed response shape as a follow-up bug against #0791.

## Evidence rules
- Leave every measured or observed field blank until a human has run the check. Do not fill in results on anyone's behalf.
- Never include a key, token, or account identifier in the task body, transcripts, or commits.

## Out of scope
- Any code change. This task only verifies live behavior and records results.
- Automating credentialed calls in CI.

## Activity

- 2026-10-15T07:47:48Z · created · njachowski@gmail.com
- 2026-10-15T07:47:54Z · assigned_to

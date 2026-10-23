---
id: "0937"
title: "Secrets follow-ups: 401 tests on widened metadata routes + document PORT/HOST reserved keys"
type: chore
status: done
priority: p2
area: [server, docs]
merged_commit: 9762cbf2be158771aa8e23d1e6410bb94e9c3c34
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/secrets-follow-ups-401-tests-on-widened-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-23T00:35:50Z"
updated_at: "2026-10-23T00:53:11Z"
last_close_out_gate_ms: 107592
last_close_out_gate_at: "2026-10-23T00:52:39.962Z"
review_passes: 1
---
## Problem
Review of #0932 (2026-10-23) left two small, safe follow-ups:
1. The widened environment/secrets list routes (metadata reads that members can now use) have no test that an UNAUTHENTICATED request is refused with 401.
2. user-docs/environment-and-secrets.md lists reserved keys but omits PORT and HOST, which the write route rejects; the docs should mirror the guard exactly.

## Desired UX
Add a 401 test per widened route (list environments, list secrets metadata, bindings read) using the existing test auth helpers; update the reserved-key list in user-docs (and docs/ security model if it repeats the list) to match the code constant, ideally by referencing one source of truth.

## Acceptance criteria
- Tests: unauthenticated GET on each widened route returns 401 and leaks no body.
- The documented reserved-key list equals the code's list (add a test that fails if they drift).

## Notes for AI
Related: #0927-#0932 (Secrets chain). Do not widen any route; tests and docs only.

## Activity

- 2026-10-23T00:35:50Z · created · njachowski@gmail.com
- 2026-10-23T00:36:13Z · status inbox→ready
- 2026-10-23T00:36:19Z · cli_override, model_override
- 2026-10-23T00:36:20Z · status ready→active, branch
- 2026-10-23T00:38:23Z · body
- 2026-10-23T00:39:55Z · body
- 2026-10-23T00:49:21Z · status active→review
- 2026-10-23T00:49:22Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-23T00:49:53Z · note: review pass 1: good to go
- 2026-10-23T00:52:39Z · close-out gate completed in 108s
- 2026-10-23T00:53:11Z · status done→done, release:success

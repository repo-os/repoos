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
updated_at: "2026-10-15T08:23:23Z"
---
## Problem
Routing for #0791 needs one credentialed smoke check against each real decision backend before anyone relies on it. Automated tests use fixtures only. Those checks require a human because they need third-party accounts, billing, a self-hosted GPU host, and secrets that an agent must never handle.

This task is independent of #0792 and #0793. It does not block either, and they do not block it. It is held and assigned to a human.

Parent/context record: #0791.

## Required accounts and setup (human)

## Checks to run (human, once the setup above exists)


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

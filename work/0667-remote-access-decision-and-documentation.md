---
id: "0667"
title: Remote-access decision and documentation
type: feature
status: inbox
priority: p1
area: docs
story: Cloud attachment storage
depends_on: ["0662"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:40Z"
updated_at: "2026-10-05T12:01:05Z"
---
Slice 10: Explicit decision on server-mediated vs hosted authorization service. If no offline-access promise is made, docs say plainly what retrieval requires. No unproven offline claims anywhere.

## Original prompt
Can you flesh this out?

## Problem
The repo currently has no documented position on server-mediated vs hosted authorization for remote access. Docs (e.g., docs/deployments.md, docs/remote-validation.md, docs/native-auth.md) use ambiguous phrasing that could be read as an offline-access promise. There is no explicit statement of what retrieval requires (e.g., active server connection, valid session/token, network reachability). This leaves users and reviewers unsure whether content is available without connectivity.

## Desired UX
A clear, single decision is recorded in the task and reflected in docs: server-mediated authorization (not a hosted third-party service) is the model. Wherever docs describe remote/content retrieval, they state plainly: retrieval requires an active server connection, valid authorization, and network reachability. No sentence implies offline access, cached retrieval, or local-only availability unless that mode is explicitly supported and documented separately.

## Acceptance criteria
- Task body contains the explicit decision: server-mediated authorization service (not hosted external auth).
- At least three doc files that reference remote access or retrieval include a plain-language sentence stating what retrieval requires (server connection + authorization + network), with no unproven offline claims.
- No bare TODO/TBD/placeholders remain in the added sections.
- The body outside ## Original prompt is at least 400 characters.
- Existing sections (## Original prompt, ## Screenshots, ## Activity) are untouched.

## Notes for AI
This is a docs/decision task, not a feature implementation. Do not add runtime dependencies or change auth code. Focus on documentation accuracy: read docs/deployments.md, docs/remote-validation.md, docs/native-auth.md, and any other docs mentioning remote/content retrieval. Confirm the decision with the human if ambiguous; if the decision is already made, record it verbatim. Use repoos update --body or edit via CLI; never edit work/*.md directly.

## Activity

- 2026-10-05T08:29:40Z · created · unknown
- 2026-10-05T11:15:29Z · needs_input
- 2026-10-05T12:00:32Z · needs_input
- 2026-10-05T12:01:05Z · body

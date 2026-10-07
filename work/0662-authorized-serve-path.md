---
id: "0662"
title: Authorized serve path
type: feature
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys)"
priority: p1
area: server
story: Cloud attachment storage
depends_on: ["0660", "0661"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:09Z"
updated_at: "2026-10-06T23:48:10Z"
---
Slice 5: Private bucket, live authz check per request, short-lived download URLs, cross-repo/cross-instance isolation. Negative tests must fail if checks removed.

## Original prompt
Slice 5 of the Cloud attachment storage story (after 0658 interface, 0659 settings, 0660 Neon provider, 0661 stable reference format). Authorized serve path: private bucket, live authz check per request, short-lived download URLs, cross-repo/cross-instance isolation. Negative tests must fail if checks removed.

## Problem
Attachments stored in a private cloud bucket must not be retrievable by anyone who knows the object key. The server must check the requesting user's live RepoOS authorization on every download request, issue only short-lived URLs (not durable read credentials), and enforce isolation per repository and per RepoOS instance. Without this, possession of a reference or URL equals authorization, which violates the story's access-control model. Cross-repo and cross-instance leakage must be impossible even if a user has valid session tokens.

## Desired UX
No visible change for users who never configure cloud storage; local attachments continue to work identically. When cloud is active, a user clicks an attachment in a task or input and receives the file only if their live authorization passes; unauthorized or cross-repo attempts are rejected silently or with a clear denial, never with bytes or a working URL. The authorization check is per-request, not cached across requests, and the URL expires quickly enough that replay past expiry fails.

## Acceptance criteria
- Every download request performs a live authz check against the user's current RepoOS role/permissions before any bytes or URL are returned.
- Download URLs are short-lived; replay after expiry must fail (tested, not just configured).
- Bucket/objects are private; no durable read credentials are embedded or cached in RepoOS.
- Cross-repository access is rejected by a test that fails if the isolation check is removed.
- Cross-instance access is rejected by a test that fails if the instance-isolation check is removed.
- Negative tests exist for all three: missing authz check, missing cross-repo isolation, missing cross-instance isolation.
- No new runtime dependency unless explicitly authorized in this task; prefer server-side signing or presigned URL from the provider.
- Depends on 0660 (provider + credentials) and 0661 (reference format + resolver) being resolved first.

## Notes for AI
This is Slice 5 of the Cloud attachment storage story. Do not implement without 0660 and 0661 complete. The reference format from 0661 must be used; do not invent a new key format. The authz model should reuse the existing RepoOS authorization logic (session/user role) rather than introducing a parallel permission system. Keep the zero-runtime-dependency constraint in mind: prefer a server-mediated presigned URL or a provider-native short-lived URL mechanism over pulling in an AWS SDK. All isolation checks must have paired negative tests; do not rely solely on positive success tests. If a section does not apply, say so explicitly rather than leaving placeholders.

## Activity

- 2026-10-05T08:29:09Z · created · unknown
- 2026-10-05T11:15:28Z · needs_input
- 2026-10-05T12:05:18Z · needs_input
- 2026-10-05T12:06:49Z · body
- 2026-10-06T23:48:10Z · needs_input

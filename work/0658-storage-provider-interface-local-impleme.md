---
id: "0658"
title: Storage-provider interface + local implementation
type: feature
status: done
priority: p1
area: core
story: Cloud attachment storage
merged_commit: 51ed988def5da085f16f183fec6ff6a89fec5f04
assigned_to: ai
created_by: ""
branch: feat/storage-provider-interface-local-impleme
created_at: "2026-10-05T08:28:45Z"
updated_at: "2026-10-05T13:46:52Z"
---
Slice 1: Extract current gitignored-directory behavior behind the interface (local implementation) with zero behavior change. Reference implementation for all later providers.

Scope:
- Define the storage-provider interface in core.
- Implement the local provider that preserves today's gitignored-directory behavior (e.g., .attachments under work/ and inputs/).
- Zero behavior change — no new features, no UI changes, no config changes.

Acceptance criteria:
- Local provider is the reference; later providers (cloud, neon, etc.) implement the same interface.
- Existing .attachments storage and retrieval works identically before/after.
- No new runtime dependencies.

Notes for AI:
- Keep the interface minimal; only expose what's needed for attachment storage/retrieval.
- Reference docs/ files for current behavior before extracting.

## Activity

- 2026-10-05T08:28:45Z · created · unknown
- 2026-10-05T08:45:28Z · status inbox→ready
- 2026-10-05T09:15:17Z · status ready→inbox
- 2026-10-05T09:15:49Z · body
- 2026-10-05T09:27:36Z · status inbox→ready
- 2026-10-05T11:15:31Z · needs_input
- 2026-10-05T11:19:44Z · needs_input
- 2026-10-05T11:52:38Z · status ready→active, branch
- 2026-10-05T12:49:56Z · status active→review
- 2026-10-05T13:46:52Z · status review→done, release:success

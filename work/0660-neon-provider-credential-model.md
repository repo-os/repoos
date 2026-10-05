---
id: "0660"
title: Neon provider + credential model
type: feature
status: inbox
priority: p1
area: server
story: Cloud attachment storage
depends_on: ["0658"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:28:57Z"
updated_at: "2026-10-05T12:17:48Z"
---
Slice 3 of storage provider work (after 0658 interface + 0659 settings UI). Scope:
- Neon Object Storage provider implementing the 0658 provider interface.
- Zero runtime dependency on Neon SDK / AWS SDK unless explicitly authorized (open question on signing below).
- Verify current Neon Object Storage API, rate limits, and pricing against official docs before committing to endpoint choices.
- Credential model: how provider keys/secrets are stored/retrieved; confirm against 0659 config schema.

Open questions to resolve before engineering:
1. Signing: Neon uses S3-compatible signatures. Do we require the AWS SDK just for signing, or is a zero-runtime-dep HMAC/S3-signature implementation acceptable?
2. Which Neon endpoints/regions and what limits (object size, request rate, egress)? Confirm against docs.
3. Does 0659's settings UI cover Neon-specific fields (endpoint, region, bucket prefix) or only generic key/secret?

Acceptance:
- Provider registered in registry, passes interface contract.
- No new runtime dependency without explicit task authorization.
- Docs/src references verified against official Neon Object Storage docs.
- Credential storage follows the model defined in 0659.

Depends: 0658, 0659.
Area: server.

## Original prompt
Slice 3 of storage provider work (after 0658 interface + 0659 settings UI). Scope: Neon Object Storage provider implementing the 0658 provider interface; zero runtime dependency on Neon SDK/AWS SDK unless explicitly authorized; verify API/limits/pricing against official docs; credential model aligned with 0659.

## Problem
Without the Neon provider (slice 3), the storage-provider interface from 0658 has only a local reference implementation. The cloud-attachment-storage story requires a second provider so the interface is actually exercised end-to-end, and so administrators can choose cloud storage in Settings (0659). The open design risk is signing: Neon is S3-compatible (SigV4), and a zero-runtime-dependency constraint is explicit unless a task authorizes an exception. Without resolving signing, endpoint choices, and limits against official Neon docs, engineering would build on assumptions rather than verified contracts, and the credential model might mismatch the 0659 settings schema.

## Desired UX
Administrators see Neon listed as an available provider in Settings once 0659 is configured; no visible change for users who stay on local storage. When Neon is selected, uploads go through the provider interface with verified endpoint/region settings, and the server verifies official docs for limits before accepting large objects. No UI change is required for this slice; behavior change is server-side and config-side only.

## Acceptance criteria
- Neon provider registered in the provider registry and implements the 0658 interface contract (upload, download, delete, resolve).
- Zero runtime dependency preserved; any AWS/Neon SDK dependency requires explicit authorization recorded in this task.
- API endpoints, rate/object limits, and pricing verified against official Neon Object Storage documentation (not assumptions), with findings noted.
- Credential storage follows the model defined in 0659 (environment/secrets, not committed config).
- Open questions resolved and recorded: signing approach, endpoint/region/limit verification, and 0659 settings-UI coverage.

## Notes for AI
This is a server/core slice: no product code commits to main without authorization, no server starts unless explicitly requested. Verify docs before committing endpoint choices; do not assume S3 compatibility implies exact behavior. If signing requires an SDK, stop and ask for explicit authorization rather than adding the dependency silently. Coordinate with 0658 and 0659 siblings: the provider must match the interface, and credentials must match the config schema.

## Screenshots
None — server/config slice, no UI change.

## Activity

- 2026-10-05T08:28:57Z · created · unknown
- 2026-10-05T09:16:12Z · needs_input, body
- 2026-10-05T09:27:44Z · status inbox→ready
- 2026-10-05T12:17:40Z · status ready→inbox
- 2026-10-05T12:17:48Z · needs_input

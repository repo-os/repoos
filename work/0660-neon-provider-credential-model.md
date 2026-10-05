---
id: "0660"
title: Neon provider + credential model
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p1
area: server
story: Cloud attachment storage
depends_on: ["0658"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:28:57Z"
updated_at: "2026-10-05T12:17:40Z"
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

## Activity

- 2026-10-05T08:28:57Z · created · unknown
- 2026-10-05T09:16:12Z · needs_input, body
- 2026-10-05T09:27:44Z · status inbox→ready
- 2026-10-05T12:17:40Z · status ready→inbox

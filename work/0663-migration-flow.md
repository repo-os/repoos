---
id: "0663"
title: Migration flow
type: feature
status: inbox
priority: p1
area: core
story: Cloud attachment storage
depends_on: ["0660", "0661"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:15Z"
updated_at: "2026-10-05T09:16:41Z"
---
Slice 6: Dry run, resumable upload, verification before local originals released. Migration is safely repeatable.

## Problem
Moving attachments from local originals to cloud storage (via 0660 provider) must be non-destructive and repeatable. A partial failure should not leave originals deleted or uploads half-done.

## Scope
- Dry-run mode (`--dry-run`): compute intended uploads and reference rewrites without mutating storage or deleting originals.
- Resumable upload: leverage 0664 upload-state/retry mechanism; resume interrupted uploads; avoid duplicate objects.
- Verification gate: after upload completes, confirm cloud object exists, is readable, and the 0661 reference resolver can map it back before releasing the original.
- Only after verification passes: delete/replace local original; support a recoverable backup window.
- Idempotency: re-running the flow skips already-verified/migrated references and is a safe no-op.

## Acceptance criteria
- `repoos migrate` supports `--dry-run` and reports planned changes.
- Partial uploads resume; no orphaned duplicates on retry.
- Local originals retained until verification succeeds.
- Repeat runs are safe no-ops for completed items.
- Failure at any stage leaves state recoverable (originals intact, upload state clear).

Depends: 0660 (provider + credentials), 0661 (reference + resolver), 0664 (upload retry/state).
Area: core. Story: Cloud attachment storage.

## Activity

- 2026-10-05T08:29:15Z · created · unknown
- 2026-10-05T09:16:41Z · body

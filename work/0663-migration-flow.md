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
updated_at: "2026-10-05T12:06:02Z"
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

## Desired UX
No UI change for this slice; user interaction is the CLI `repoos migrate` command. The desired experience: administrator can run dry-run first, see planned moves, run migration with resume support, and know originals survive until verification passes. Re-running after interruption resumes cleanly.

## Acceptance criteria
- `repoos migrate` supports `--dry-run` and reports planned changes.
- Partial uploads resume; no orphaned duplicates on retry.
- Local originals retained until verification succeeds.
- Repeat runs are safe no-ops for completed items.
- Failure at any stage leaves state recoverable (originals intact, upload state clear).

## Notes for AI
This is slice 6 of the Cloud attachment storage story. It depends on 0660 (provider/credentials), 0661 (reference/resolver), 0664 (upload retry/state). Reuse 0664's upload-state mechanism for resumable uploads. The verification gate must call 0661's resolver before deleting local originals. No settings UI is in scope here (covered by 0659). Honor the zero-runtime-dependency constraint unless a task explicitly authorizes an exception. Do not implement provider-specific upload code that duplicates 0660.

Depends: 0660 (provider + credentials), 0661 (reference + resolver), 0664 (upload retry/state).
Area: core. Story: Cloud attachment storage.

## Original prompt
Slice 6: Dry run, resumable upload, verification before local originals released. Migration is safely repeatable.

## Activity

- 2026-10-05T08:29:15Z · created · unknown
- 2026-10-05T09:16:41Z · body
- 2026-10-05T11:15:29Z · needs_input
- 2026-10-05T12:05:11Z · needs_input
- 2026-10-05T12:05:54Z · body

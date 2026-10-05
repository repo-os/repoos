---
id: "0658"
title: Storage-provider interface + local implementation
type: feature
status: review
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p1
area: core
story: Cloud attachment storage
assigned_to: ai
created_by: ""
branch: feat/storage-provider-interface-local-impleme
created_at: "2026-10-05T08:28:45Z"
updated_at: "2026-10-05T12:49:56Z"
dev_error_count: 1
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

## Implementation (slice 1)

- Added `src/core/storage/`: `types.ts` defines the minimal `StorageProvider`
  (`put`/`get`/`list`/`remove`/`removeNamespace`, plus optional `localPath`/`size`
  for a local fast path); `local.ts` is `localStorageProvider(baseDir)` — the
  reference implementation storing under `<baseDir>/.attachments/<namespace>/`,
  path-traversal-safe, exactly today's gitignored behavior; `registry.ts` maps
  provider ids to factories with local as the always-available default, so
  #0660 (Neon) registers here and #0659 selects by config.
- Rewired callers to the provider with **no signature or behavior change**:
  task screenshots (`src/server/attachments.ts`, incl. a new provider-backed
  `readAttachment`/`listAttachments` and the `getScreenshot` route now serving
  bytes via the provider) and input attachments (`src/core/input.ts`).
- `docs/architecture.md` documents the seam. No new runtime dependencies; no
  config, UI, or storage-layout changes. `pm-attachments.ts` stays on the raw
  local path (batch move; a cloud story addresses it in the migration slice).
- Tests: `src/ui-app/tests/storage-provider.test.ts` covers the provider and
  registry, plus unchanged task/input storage and serving.

## Activity

- 2026-10-05T08:28:45Z · created · unknown
- 2026-10-05T08:45:28Z · status inbox→ready
- 2026-10-05T09:15:17Z · status ready→inbox
- 2026-10-05T09:15:49Z · body
- 2026-10-05T09:27:36Z · status inbox→ready
- 2026-10-05T11:15:31Z · needs_input
- 2026-10-05T11:19:44Z · needs_input
- 2026-10-05T11:52:38Z · status ready→active, branch
- 2026-10-05T11:52:39Z · needs_input
- 2026-10-05T12:12:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-05T12:34:13Z · needs_input
- 2026-10-05T12:34:13Z · needs_input
- 2026-10-05T12:44:26Z · body
- 2026-10-05T12:49:56Z · status active→review

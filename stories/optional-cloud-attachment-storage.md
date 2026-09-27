---
name: "# Optional Cloud Attachment Storage"
number: "0005"
created_at: "2026-09-27T17:40:05.585Z"
created_by: hello@repoos.org
---
# Optional Cloud Attachment Storage

Add optional cloud storage for RepoOS screenshots and attachments using Neon Object Storage. Keep local storage as the default.

Today, task and input attachments live on the machine running RepoOS under gitignored attachment directories. Provide a cloud-backed option so files can remain available without relying on that machine’s disk, while preserving RepoOS’s repository-native task records and access controls.

## Desired behavior

- An administrator can configure local or Neon Object Storage attachment storage from Settings.
- Start with task and input screenshots, using a shared attachment-storage interface that can support other file types later.
- Task/input Markdown retains a stable attachment reference. Never embed credentials or expiring signed URLs in Markdown.
- Existing local attachments continue to work. Offer an explicit migration flow to upload them; keep local originals until uploads are verified.
- Show clear upload, retry, and failure states. Never report an attachment as available before its upload succeeds.
- Preserve attachment previews and downloads in the current UI.

## Access and isolation

- Buckets and objects are private by default.
- Check the requesting user’s live RepoOS authorization before serving an attachment or issuing a short-lived download URL.
- Isolate attachments by repository and instance; knowing an object key must not grant access.
- Keep credentials server-side, protected at rest, and absent from browser responses, task files, Git, logs, and support bundles.
- Validate upload size, file type, and filenames.
- Keep binaries gitignored; cloud storage must not introduce tracked screenshots under work/ or inputs/.

## Availability

Cloud storage makes the files independent of the original machine’s disk, but does not automatically make the local RepoOS server available remotely.

Decide and document how an authorized user retrieves attachments when that machine is offline. If this requires a hosted authorization service, define its scope and dependencies explicitly. Do not imply offline availability until the complete access path works.

## Lifecycle and recovery

- Define deletion, retention, and orphan cleanup behavior.
- Make uploads, retries, migration, and deletion safely repeatable.
- Handle Neon outages without losing task records or local originals.
- Explain how cloud attachments behave when a repository is cloned, moved to another machine, restored, or accessed through a task worktree.
- Switching storage modes must not silently strand existing attachments.

## Architecture

- Introduce a storage-provider interface with local filesystem and Neon Object Storage implementations.
- Verify Neon’s current API, limits, pricing, and credential model against official documentation.
- Preserve RepoOS’s zero-runtime-dependency constraint unless a separate task explicitly authorizes an exception.
- Add required Settings controls, configuration schema entries, documentation, and tests.
- Keep this feature independent of Telegram provisioning and the email-list application, while allowing shared hosting infrastructure where appropriate.

## Acceptance criteria

- Local attachment behavior remains unchanged by default.
- An admin can configure Neon storage and upload, preview, and download a screenshot.
- Existing local screenshots can be migrated without data loss or broken references.
- Unauthorized and cross-repository access are rejected.
- Failed uploads are visible and retryable.
- Deletion and recovery behavior are documented and tested.
- Any promise of access while the original machine is offline is demonstrated end-to-end.

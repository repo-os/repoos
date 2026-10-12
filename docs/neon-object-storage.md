# Neon Object Storage provider (#0660)

Slice 3 of the "Cloud attachment storage" story: the Neon Object Storage
provider that implements the #0658 [`StorageProvider`](../src/core/storage/types.ts)
interface, plus the credential model. This page records the decisions the task
asked to be made deliberately and the facts verified against Neon's official
documentation, so a later slice does not have to re-derive them.

Read alongside `user-docs/configuration.md` (Attachment storage) and
`user-docs/environment-and-secrets.md`.

## Decisions

### 1. Signing: hand-rolled SigV4, no SDK

Neon Object Storage is S3-compatible and **SigV4-only, path-style-only**
([s3-compatibility](https://neon.com/docs/storage/s3-compatibility)). The story
forbids a runtime dependency on the Neon or AWS SDK unless a task explicitly
authorizes one, and this task does not.

**Decision: implement SigV4 in `src/core/storage/sigv4.ts` with `node:crypto`'s
HMAC-SHA256 — zero dependencies.** This is security-sensitive code, so it is not
trusted on its own: `src/core/storage/sigv4.test.ts` checks it against the
official AWS `aws-sig-v4-test-suite` vectors (the same values AWS publishes),
including `get-vanilla`, `get-vanilla-empty-query-key`,
`get-vanilla-query-order-key-case`, and the published signing-key derivation
example. A future refactor that breaks canonicalization fails those tests.

The presigned-URL flow Neon offers
(`POST …/objects/{key}/presign`, no S3 credentials needed) remains an option for
the *serve* path in slice 5 (#0662), where a short-lived URL is wanted anyway;
it does not remove the need for signing on the upload/delete path here.

### 2. Synchronous transport: a child process, not a worker + `Atomics.wait`

The #0658 interface is deliberately synchronous, and the server's attachment
read path (`readAttachment`, `listAttachments`) calls it inline. Node/Bun have
no synchronous HTTP primitive, so the provider bridges the async call itself.

The obvious bridge — a `worker_threads` worker with the main thread blocking in
`Atomics.wait` — **does not work on Bun**: while the main thread sits in
`Atomics.wait`, Bun starves the worker's I/O loop, so the worker connects and
writes the request but never receives the response (reproduced on Bun 1.4.2; the
same code works on Node). Since RepoOS defaults to Bun, the provider instead
spawns a short-lived `process.execPath` child (`node:http`/`node:https`) and
blocks in `spawnSync` until it prints a JSON result. This works identically on
Bun and Node, needs no package, and keeps the child script inline so nothing has
to be copied into `dist/`.

Costs, stated honestly: one process per request (fine at human scale for
attachment reads, not for bulk work) and the full body buffered in memory (the
server's own screenshot ceiling is 10 MB, far below Neon's 5 GiB object limit).
The transport is an injectable seam (`SyncHttpTransport`), so provider tests use
a fake and never spawn anything.

### 3. Credential model: environment, matching what #0659 left open

#0659 added only the `[storage] provider` key and deliberately added **no**
credential fields — the story's rule is "credentials come from
environment/secrets, not from the committed config". So:

- `repoos.toml` `[storage] provider` selects *whether* cloud storage is used.
- The environment supplies *how* to reach it: `REPOOS_NEON_STORAGE_ENDPOINT`,
  `…_REGION`, `…_BUCKET`, `…_ACCESS_KEY_ID`, `…_SECRET_ACCESS_KEY`, and an
  optional `…_PREFIX`.

RepoOS deliberately reads RepoOS-named variables, **not** the generic `AWS_*`
names Neon's own adapters use, so a Neon credential configured for RepoOS is
never silently picked up by an unrelated AWS tool in the same environment. The
provider reports itself unavailable with a reason until every required variable
is present, so `resolveStorageProvider` falls back to `local` and Settings
explains why — the #0659 contract, unchanged.

### 4. #0659's Settings UI covers provider selection only

0659's schema has a single `storage.provider` select (options `local`, `neon`)
and no Neon-specific fields. That is correct for this slice: endpoint, region,
and bucket are credential-adjacent values that belong with the secret, not in a
committed file, and the story says no UI change is in scope for #0660. Neon
appears in Settings as soon as its credentials are set; until then it is listed
but explained as unavailable.

## Verified against Neon's official docs (2026-10)

| Fact | Value | Source |
| --- | --- | --- |
| API | S3-compatible, **SigV4 only, path-style addressing only** (`forcePathStyle: true`) | [s3-compatibility](https://neon.com/docs/storage/s3-compatibility) |
| Endpoint | Per-branch `https://br-….storage-c-*.aws.neon.tech`, with `region` and `force_path_style` | [API: storage state](https://neon.com/docs/reference/api/storage) |
| Regions (public beta) | AWS US East (Ohio, `aws-us-east-2`), US East (N. Virginia), Europe (Frankfurt), Asia Pacific (Singapore) | [overview](https://neon.com/docs/storage/overview) |
| Max object size | **5 GiB** today, single-request or multipart; planned up to 5 TB / 5 GB single-request on paid plans | [objects](https://neon.com/docs/storage/objects) |
| Supported ops used here | GetObject (Range), HeadObject, PutObject, DeleteObject (soft-delete on branch), DeleteObjects (batch ≤ 1,000 keys), ListObjectsV2 | [s3-compatibility](https://neon.com/docs/storage/s3-compatibility) |
| Unsupported over S3 wire | `PutBucketAcl`/`PutBucketPolicy`/`PutObjectAcl` (set access level in Console/API instead) | [s3-compatibility](https://neon.com/docs/storage/s3-compatibility) |
| Pricing | Object Storage $0.023/GB-month; no per-operation charge; egress shares the account's public-network-transfer allowance (5 GB Free, 500 GB Launch, then $0.10/GB) | [plans](https://neon.com/docs/introduction/plans) |
| Free plan | 5 GB Object Storage per project | [plans](https://neon.com/docs/introduction/plans) |
| Credential | `neon credentials create --scope storage:read --scope storage:write` returns `token_id` (access key id) + `s3_secret_access_key` | [get-started](https://neon.com/docs/storage/get-started) |

### What the provider does with those facts

- **Enforces the 5 GiB ceiling before sending** (`NEON_MAX_OBJECT_BYTES`), so an
  oversized upload fails fast with a clear error instead of a truncated object.
- **Never attempts an ACL/policy write**; a private bucket is set in the Neon
  Console/API. (The "objects are private, authz checked at serve time" work is
  slice 5, #0662.)
- **Does not use multipart**: RepoOS attachments are capped at 10 MB by the
  server, far below the point where multipart is needed (AWS recommends it above
  100 MB), so single-request PutObject is complete for this use.
- **`removeNamespace`** uses ListObjectsV2 + batched DeleteObjects (≤ 1,000 per
  call), because the S3 wire has no delete-by-prefix and RepoOS holds S3
  credentials, not a Neon session.

## Object-key layout and isolation

An object key is `<prefix>/<base>/<namespace>/<name>`:

- `prefix` — the configured `REPOOS_NEON_STORAGE_PREFIX` (instance isolation).
- `base` — a 16-char hash of the attachment base directory, so `work` and
  `inputs` never collide and a moved checkout keeps addressing the same objects
  (the absolute path is deliberately *not* in the key).
- `namespace`/`name` — the task/input id and file name.

Cross-repository and cross-instance isolation, and the negative tests proving
them, are slice 5 (#0662); this layout is what that slice builds on.

## Open questions this task resolves

1. **Signing** — hand-rolled SigV4, no SDK (decision 1). No dependency
   authorization is needed or requested.
2. **Endpoint/region/limits** — verified above; the provider enforces the 5 GiB
   ceiling and issues no unsupported operations.
3. **0659 settings coverage** — provider selection only; Neon credentials live
   in the environment (decision 3 and 4).

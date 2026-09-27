---
name: Cloud attachment storage
number: "0005"
created_at: "2026-09-27T17:40:05.585Z"
created_by: hello@repoos.org
---
# Cloud attachment storage

## Goal

Give RepoOS an **optional** cloud backend for attachments — starting with task
and input screenshots — so files outlive the disk of the machine running the
server, without weakening RepoOS's repository-native task records, its
access-control model, or its "no binaries in git" rule. Local filesystem
storage stays the default and stays fully supported; cloud is a choice an
administrator makes, and turning it off must never strand an attachment.

The point of the feature is durability and portability of *files*. RepoOS's
task Markdown remains the record of truth: what changes is where the bytes
live, never what the Markdown claims about them.

## Scope

- **A storage-provider interface** with two implementations: the existing
  gitignored local attachment directories, and Neon Object Storage. Every
  attachment read/write/delete goes through the interface so a third provider
  (S3, R2, local network) is a small addition later, and so "other file types
  later" (release artifacts, spec exports) does not require a second redesign.
- **Task and input screenshots first.** The existing upload, preview,
  full-size viewer and download affordances keep working, whichever backend is
  active.
- **Settings UI + config schema** for choosing the provider and supplying
  credentials, with the same "every user-facing `repoos.toml` setting needs a
  Settings control" rule as any other feature. Credentials come from
  environment/secrets, not from the committed config.
- **A stable, opaque attachment reference in Markdown** — a logical handle the
  server resolves to a location at read time. No credentials, no expiring
  signed URLs, no provider-specific absolute URLs in a committed file.
- **Explicit migration flow** from local to cloud: a dry run, a real upload, a
  verification pass, and local originals retained until verification passes.
  Migration is resumable and safely repeatable.
- **Honest upload state.** Uploading, retrying, failed. An attachment is never
  presented as available before its upload has actually succeeded, and a failed
  upload is visible and retryable from the UI.
- **Access control at serve time.** The requesting user's *live* RepoOS
  authorization is checked before bytes or a short-lived URL are handed out.
  Buckets and objects are private; objects are isolated per repository and
  per RepoOS instance, so possession of an object key is not authorization.
- **Validation** of upload size, MIME type, and filename before anything is
  written or forwarded.

## Explicit non-goals

- **Not a hosted RepoOS.** Uploading to object storage does not make a local
  `repoos serve` reachable from another machine. Cloud files surviving the
  machine's disk is a *storage* guarantee, not an *access* guarantee.
- **No change to the local-storage default behavior.** Local attachments must
  behave exactly as they do today for a user who never touches Settings.
- **No binaries in git** — locally or via cloud. Cloud storage must not become a
  back door for tracked screenshots under `work/` or `inputs/`, and the
  task-asset guard stays as-is.
- **No runtime dependency** on the Neon SDK or an AWS SDK unless a task
  explicitly authorizes it. See open questions on how signing is done.
- **Independent of Telegram provisioning and the email-list application.** Shared
  hosting infrastructure is fine; shared code paths and shared configuration
  surface are not.
- **Not a bulk-attachments product feature.** One file type path, done properly,
  beats a general file manager shipped half-finished.

## Delivery slices (candidate task breakdown)

This story is large enough that it should be decomposed, and the dependency
order matters — the interface has to exist before either backend can be swapped,
and local is the reference implementation the tests are written against.

1. **Storage-provider interface + local implementation.** Extract the current
   gitignored-directory behavior behind the interface with no behavior change.
   Everything after this is additive.
2. **Config schema + Settings UI for provider selection**, with local as the
   default and cloud unavailable-but-explained until configured.
3. **Neon provider + credential model**, with the zero-dependency constraint
   honored and the API/limits/pricing verified against Neon's official docs
   (see open questions).
4. **Stable reference format + resolver**, so Markdown written today and Markdown
   written during migration both resolve, and neither embeds secrets.
5. **Authorized serve path**: private bucket, live authz check per request,
   short-lived download URLs, cross-repository/cross-instance isolation, and
   the negative tests that prove all three.
6. **Migration flow** with dry run, resumable upload, verification before local
   originals are released.
7. **Upload state + retry UX**, including the case where the upload fails after
   the local file was already written.
8. **Lifecycle: deletion, retention, orphan cleanup, recovery**, plus the
   documentation of what happens on clone, move to another machine, restore, and
   access through a task worktree.
9. **Outage and mode-switch behavior**: Neon unavailable must degrade to
   "local original still here, upload pending" — never to a lost task record or
   a deleted local file.
10. **Remote-access decision and its documentation** — see availability below.

## Availability: the honest part

Cloud storage removes the dependency on the original machine's *disk*. It does
nothing for the fact that the original machine is the *server*. Until a task in
this story demonstrably returns an attachment to an authorized user from
somewhere other than that machine, the story must not claim offline
availability anywhere in its copy, docs, or UI.

Two shapes are possible, and the choice belongs in open questions rather than
being assumed:

- **Server-mediated only**: cloud storage is durability and backup. Retrieval
  still requires the owning RepoOS server to be up. This is honest, much
  cheaper, and is a complete feature — it just is not a remote-access feature.
- **Hosted authorization service**: a small service that brokers short-lived
  download URLs for authorized users, so retrieval survives the origin machine.
  This is a substantially larger surface — its own authz trust relationship with
  RepoOS, its own hosting, its own failure modes, and it needs an explicit
  task authorizing the scope and naming the dependencies.

Recommendation: ship the first shape completely, and treat the second as a
separate story that may only start once the complete access path — authz,
  broker, URL issuance, audit — has been designed. Whatever is decided,
  acceptance criterion "any promise of access while the original machine is
  offline is demonstrated end-to-end" should be restated as: *either* the
  end-to-end demo passes, *or* no such promise is made anywhere, and the
  documentation says plainly what retrieval requires.

## Open questions

- **Signing without a dependency.** Neon's object storage is S3-compatible,
  which implies SigV4 request signing. Implementing SigV4 by hand is possible
  but security-sensitive. Alternatives: a presigned-URL flow where RepoOS
  requests a short-lived URL from Neon at upload time (no signing code in
  RepoOS, but every request then round-trips), or a one-off authorization for
  an SDK dependency. This decision should be made once, deliberately, and
  recorded.
- **What does a private bucket actually require at read time?** RepoOS must not
  hold durable read credentials it could use to bypass a user's authorization.
  Read paths should be per-request and short-lived; confirm Neon's supported
  model for that.
- **Instance and repository isolation**: is that a prefix convention, separate
  buckets, or separate credentials? A prefix is the cheap answer and the one
  most likely to be got wrong under a bug — worth an explicit test matrix.
- **Reference format stability**: how does a reference stay resolvable across a
  storage-mode switch, a repo rename, and a move to another machine? Decide the
  format before any backend exists, because migrating it later is expensive.
- **Retention and deletion**: does deleting a task delete its attachments, or
  do attachments outlive the task under a retention window? What sweeps orphans,
  on what schedule, and can it ever delete a local original?
- **Cost and limits**: verified per-object and per-bucket limits, egress cost,
  and free-tier thresholds, from official documentation rather than assumption.
  These belong in the docs page the story ships with.
- **Worktree behavior**: a task worktree is a different filesystem view of the
  same repository. The story must state what a cloud-backed attachment looks
  like from inside a worktree, and confirm the resolver does not depend on a
  path that only exists in the main checkout.
- **Support bundles**: the story must state that attachments and credentials are
  excluded from any support bundle, and the redaction already built for
  `.env`-adjacent secrets must cover the new credential source.

## Acceptance criteria

- A user who never configures cloud sees **identical** local attachment
  behavior.
- An administrator can configure Neon in Settings and upload, preview, and
  download a screenshot, with the upload reported as successful only after it
  is.
- Existing local screenshots migrate with **no data loss and no broken
  references**, and local originals survive until verification passes.
- Unauthorized access and cross-repository/cross-instance access are both
  rejected, and each rejection is covered by a test that fails if the check is
  removed.
- Failed uploads are visible in the UI and retryable without re-deriving
  anything the user already supplied.
- Deletion, retention, orphan cleanup, and recovery are **documented and
  tested**, not merely implemented.
- Neon being down does not lose a task record and does not delete a local
  original.
- Binaries remain gitignored; `repoos check`'s task-asset guard still passes.
- Any claim of access while the original machine is offline is either
  demonstrated end-to-end or absent from all copy and documentation.
- Zero runtime dependencies preserved, or a task explicitly authorizes the
  exception and the docs say so.

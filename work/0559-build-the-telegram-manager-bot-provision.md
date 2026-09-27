---
id: "0559"
title: Build the Telegram manager-bot provisioning service and secure instance handoff
type: feature
status: inbox
needs_input: true
questions: [Confirm Neon Functions + Neon Postgres versus Cloudflare Workers + Neon Postgres before implementation/deployment.]
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T17:32:41Z"
updated_at: "2026-09-27T17:32:41Z"
---
## Problem

Split from #0531. The automatic Connect Telegram experience needs a trusted service that owns the official RepoOS manager bot and securely hands each newly provisioned project bot to the correct local RepoOS instance. A Telegram creation link alone does not establish this binding. The manager credential must never be distributed to repository instances.

## Hosting direction — discuss before deployment

Prefer Neon Postgres for durable provisioning state and evaluate Neon Functions for the HTTP service. The user plans to use Neon for the upcoming email-list story too. Neon announced Functions and Object Storage GA on 2026-09-17: https://neon.com/blog/neon-backend-is-ga . This is a preference, not authorization to provision paid resources or deploy before the hosting decision is settled.

Cloudflare Workers with Neon Postgres remains an alternative if concrete runtime, secret-management, retry, or operational requirements make it preferable. Cloudflare documents this combination: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/ . Compare current availability, region, secrets, limits, costs, deployment, and retry behavior before choosing; do not decide using the superseded Neon beta announcement. Object storage is not required for provisioning state or credentials.

## What to build

- A separately deployed management service, with its own deployment boundary and configuration. Keep the repository-local RepoOS runtime independent of a hosted service for Bring Your Own Bot Token usage. Preserve the repo's zero-runtime-dependency constraint; isolate any hosted-service package requirements and explicitly document exceptions rather than adding dependencies to the core package.
- One official manager bot, created/configured by the operator with Bot Management Mode enabled. Treat manager setup and its credential as deployment prerequisites; never fabricate a bot identity or commit credentials.
- Authenticated, short-lived provisioning requests bound to repository identity, instance identity, and the initiating authenticated RepoOS admin. Persist expiry, nonce, and state transitions transactionally in Neon Postgres.
- Receive Telegram managed_bot updates with webhook-secret verification and deduplication, then retrieve project bot tokens through getManagedBotToken. Establish how the Telegram creator/update is securely correlated to the pending instance request; do not trust a suggested bot username, Telegram username, or arbitrary callback URL as proof. Verify the current official API and use explicit authenticated confirmation if the creation link cannot carry adequate correlation.
- Define and implement the narrow client contract for #0531's provisioning adapter. A local instance must be able to start, inspect, and complete a request using outbound HTTPS, without requiring public inbound access to its machine. Authenticate completion to the requesting instance, make redemption single-use and retries idempotent, and ensure another repository cannot claim the token.
- Deliver the project credential only to the authenticated instance server, which stores it via #0530's encrypted secret store. Never return tokens to the browser or place them in logs, URLs, git, support bundles, or plaintext database columns. Protect any temporary stored credential with authenticated encryption and document retention/deletion.
- Management lifecycle operations needed by #0539, including the supported token revocation/rotation behavior. Verify Telegram's actual semantics and document limitations rather than assuming deletion or rotation revokes all management access.
- The manager service handles provisioning and management only. Normal project messages, notifications, and agent conversations remain directly between Telegram and the repository's RepoOS instance; it stores no task contents or agent transcripts.
- Rate limits, audit records, duplicate/out-of-order update handling, expiration, recovery after restart, visible retryable failures, and operational health/logging with credential redaction.

## Done when

- A real operator-configured manager bot can provision a project bot and securely transfer its credential to a local RepoOS instance using #0531's interface.
- Two instances provisioning concurrently cannot cross-claim credentials, tested alongside replay, expiry, impersonation, duplicate updates, and service-restart recovery.
- Manager secrets never reach repository instances; project secrets never reach browsers or ordinary logs.
- Deployment and local testing instructions include manager setup, required secrets, database migrations, chosen hosting rationale, and retry/recovery behavior.
- BYO token usage works when this service is unavailable.

## Dependencies and scope

Depends on #0530 and the local adapter/client contract from #0531. Independent of completing local BYO notifications and agent chat. Hosting remains pending discussion; keep this task in inbox until that is settled. The email-list application, a central relay for project messages, general user-upload storage, and deployment of unrelated Neon products are out of scope.

## Activity

- 2026-09-27T17:32:41Z · created · unknown

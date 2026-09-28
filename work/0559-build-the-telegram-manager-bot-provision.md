---
id: "0559"
title: Build the Telegram manager-bot provisioning service and secure instance handoff
type: feature
status: active
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/build-the-telegram-manager-bot-provision
cli_override: github copilot
model_override: copilot-auto-balance
review_model_override: opencode-go/glm-5.3-flash
created_at: "2026-09-27T17:32:41Z"
updated_at: "2026-09-28T04:49:51Z"
---
## Problem

Split from #0531. The automatic Connect Telegram experience needs a trusted service that owns the official RepoOS manager bot and securely hands each newly provisioned project bot to the correct local RepoOS instance. A Telegram creation link alone does not establish this binding. The manager credential must never be distributed to repository instances.

## Hosting — decided: Neon Functions + Neon Postgres

Human decision, 2026-09-28: **Neon Functions for the HTTP service, Neon Postgres for durable provisioning state.** Cloudflare Workers + Neon Postgres is not the choice for this service. Rationale: Neon Functions keeps the whole service on one platform and one account, which also covers the upcoming email-list story, so there is no second provider to operate, bill, or secure. https://neon.com/blog/neon-backend-is-ga

What this decision does and does not settle:

- It settles the platform. The "Hosting direction — discuss before deployment" section is closed; do not reopen it without a concrete runtime, secret-management, retry, or operational finding.
- It is **not** authorization to provision paid resources, create a Neon project, or deploy. The operator supplies the Neon project, the pooled connection string, the function secrets (manager bot token, webhook secret, service-to-instance auth key), and the manager bot itself. Deployment instructions are deliverables of this task, not an action this task performs.
- Verify current Neon Functions availability, region, limits, cost, and runtime behavior against Neon's live docs at implementation time. Do not rely on the superseded Neon beta announcement, and do not assume Cloudflare Workers parity for anything this task depends on (request timeouts, background work, retry semantics, secret handling). Where the two differ and the difference matters, document it.
- Object storage is not required for provisioning state or credentials.

## What to build

- A separately deployed management service, with its own deployment boundary and configuration. Keep the repository-local RepoOS runtime independent of a hosted service for Bring Your Own Bot Token usage. Preserve the repo's zero-runtime-dependency constraint; isolate any hosted-service package requirements and explicitly document exceptions rather than adding dependencies to the core package.
- Deploy that service to Neon Functions against a Neon Postgres instance, with schema migrations for provisioning state run against that database and a documented migration/rollback procedure. Keep the service's package requirements isolated from the core RepoOS package, and keep every secret (manager bot token, webhook secret, database URL, service auth key) in the platform's secret store — never in the repo, the image, or a function's committed config.
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

Depends on #0530 (done) and the local adapter/client contract from #0531 (still `ready`, not started). Independent of completing local BYO notifications and agent chat. Hosting is settled, so this task is no longer held for a human decision; it stays in `inbox` only because #0531's client contract must exist first — move it to `ready` once #0531 lands. The email-list application, a central relay for project messages, general user-upload storage, and deployment of unrelated Neon products are out of scope.

## Activity

- 2026-09-27T17:32:41Z · created · unknown
- 2026-09-27T17:45:19Z · needs_input, body
- 2026-09-27T17:45:21Z · note: Human decision 2026-09-28: hosting settled as Neon Functions + Neon Postgres (Cloudflare Workers ruled out); needs_input cleared. Still held in inbox pending #0531's client contract.
- 2026-09-28T04:49:18Z · cli_override, model_override
- 2026-09-28T04:49:19Z · model_override
- 2026-09-28T04:49:24Z · review_model_override
- 2026-09-28T04:49:48Z · status inbox→ready
- 2026-09-28T04:49:51Z · status ready→active, branch

---
id: "0477"
title: Build Neon Functions double-opt-in updates service
type: feature
status: inbox
priority: p2
area: infra
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-21T12:07:13Z"
updated_at: "2026-09-21T12:07:13Z"
---
## Problem

RepoOS needs an owned, consent-based email-updates channel without putting database or Resend credentials in the static landing site.

## Desired UX

A public HTTP service accepts an email address, sends a one-time confirmation link, and only activates the subscriber after that link is used. Resend delivers confirmation mail and later broadcasts; Neon retains the authoritative subscription and consent lifecycle.

## Acceptance criteria

- [ ] Add a Neon Functions service declared in `neon.ts`, with TypeScript handlers for `POST /updates/subscribe`, `GET /updates/confirm`, and `POST /webhooks/resend`.
- [ ] Add versioned Neon Postgres migrations for subscribers, hashed expiring one-time confirmation tokens, and idempotent webhook-event receipts.
- [ ] Validate and normalize submitted emails; make repeated subscriptions safe; add basic bot/rate-limit protection appropriate to an unauthenticated public endpoint.
- [ ] `subscribe` records `pending`, sends a Resend transactional confirmation email, and never adds an unconfirmed address to the Resend Audience.
- [ ] `confirm` consumes the token exactly once, marks the subscriber active, and creates or updates its Resend Audience contact.
- [ ] Verify Resend webhook signatures and idempotently mirror unsubscribe, bounce, and complaint state into Neon.
- [ ] Store only secret references/configuration in deployment environments; document required variables (`DATABASE_URL`, Resend API key, audience ID, webhook signing secret, public confirmation origin). Do not commit credentials.
- [ ] Include hermetic unit/integration tests with mocked Resend requests and migrations/schema validation.
- [ ] Add an operator runbook explaining Neon project linking/deployment, Resend domain verification, required DNS records, audience creation, webhook registration, and rollback.

## Notes for AI

Neon Functions should own this HTTP boundary; keep `landing/` static. Use a module-level `pg` pool as recommended for Neon Functions. Resend broadcasts are operated from the Resend dashboard initially—do not build a campaign-authoring UI. Keep the service dependency footprint deliberate; this repository has a zero-runtime-dependencies constraint, so do not add packages to the core RepoOS app merely for this service.

## Dependencies

Run before the landing-page signup task. A human must provision the Neon project and Resend account/domain and add secrets before production deployment.

## Activity

- 2026-09-21T12:07:13Z · created · unknown

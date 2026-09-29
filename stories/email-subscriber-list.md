---
name: Email subscriber list
number: "0007"
created_at: "2026-09-29T06:06:31.000Z"
created_by: hello@repoos.org
---
# Email subscriber list

Give RepoOS an owned, consent-based email channel for occasional product and
release updates. People visiting repoos.org can opt in with double
opt-in (submit email → confirm via one-time link), and the subscriber list —
subscription state, consent lifecycle, unsubscribes and bounces — is retained
in Neon Postgres, with Resend as the delivery and broadcast layer. No database
or Resend credentials ever live in the static landing site, and the RepoOS core
app stays dependency-free.

## Background

RepoOS has no direct communication channel with its users. Release irons exist
(GitHub Releases + Homebrew tap), but there is no way to tell anyone a release
happened. This story adds the smallest useful version of that: a verified
project-updates mailing list the maintainer can write to occasionally, not a
newsletter platform. It is deliberately human-operated at launch; campaign
authoring is a non-goal.

## Outcomes

When this story is complete:

1. **A visitor can subscribe and confirm.** The repoos.org landing page offers
   an unobtrusive Project updates signup; after submitting, they get an email
   with a one-time confirmation link, and only a confirmed address becomes an
   active subscriber.
2. **Consent is authoritative and auditable.** Neon Postgres is the source of
   truth: pending → active, plus unsubscribe/bounce/complaint state mirrored
   idempotently from signed Resend webhooks. An unconfirmed address is never
   added to the Resend Audience.
3. **The maintainer can launch the channel without touching code** — Neon
   project linked, Resend domain verified (SPF/DKIM/DMARC), webhooks
   registered, secrets in the provider dashboards, and an end-to-end test with
   two controlled addresses (one confirms; another unsubscribes and never
   receives a broadcast).
4. **An inaugural update goes out** through a verified domain, with
   delivery/bounce metrics reviewed afterward.

## Delivery slices

| Task | Focus |
|------|-------|
| **0477** | Neon Functions double-opt-in updates service (subscribe/confirm/webhook endpoints, migrations, tests, operator runbook) |
| **0478** | repoos.org signup and confirmation UX on the static landing page |
| **0479** | Production configuration and launch checklist (human-operated: Neon, Resend, DNS, secrets) |

Ordering: **0477 → 0478 → 0479**. The service must exist before the landing
form has an endpoint to call, and both must be complete before the human-run
configuration and launch slice starts.

## Non-goals

- Campaign authoring, scheduling, or in-product newsletter management —
  broadcasts stay in the Resend dashboard.
- Pushing subscription data into RepoOS core or the RepoOS app itself.
- A hand-rolled email stack beyond Resend + Neon.
- Storing any credentials in the landing bundle, the repo, or agent prompts.

## Open questions

- **What is the inaugural note?** A short, clearly labelled "first update"
  describing the current state of the project — decide content right before
  the launch slice.
- **Signup placement.** Where on the landing page does it sit relative to the
  existing calls to action (implied by #0478's "near the existing CTAs", but
  confirm visually)?
- **Rate-limit posture.** Is a generic token-bucket per source IP sufficient
  for the public endpoint, or does Resend-side suppression cover the risk?

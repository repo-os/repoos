---
id: "0479"
title: Configure and launch the RepoOS project-updates channel
type: feature
status: inbox
priority: p2
area: infra
story: Email subscriber list
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-21T12:09:32Z"
updated_at: "2026-09-21T20:10:53Z"
---
## Problem

The newsletter code is not useful until the production Neon and Resend resources are configured, DNS is verified, and the end-to-end consent and unsubscribe flow has been exercised. These steps require account access and secret values that must not be placed in a coding-agent prompt.

## Desired outcome

repoos.org can accept a real subscription, require email confirmation, and send a respectful initial product update through a verified Resend domain.

## Launch checklist

- [ ] Create/link the production Neon project and deploy the service from #0477.
- [ ] Create a Resend Audience for RepoOS project updates and a least-privilege API key.
- [ ] Verify the intended sending domain and publish the DNS records Resend requires (SPF/DKIM/DMARC as directed by Resend).
- [ ] Add production secrets and the landing public endpoint configuration through the hosting/provider dashboards; never commit them.
- [ ] Register the signed Resend webhook endpoint and subscribe it to unsubscribe, bounce, complaint, and contact lifecycle events.
- [ ] Deploy the landing page from #0478.
- [ ] Test with two controlled addresses: confirm one subscription; confirm that a second can unsubscribe and receives no subsequent broadcast.
- [ ] Send a small, clearly labelled inaugural update only after the end-to-end test succeeds; review delivery/bounce metrics afterward.

## Notes

This is intentionally a human-operated task because it needs access to Neon, Resend, DNS, and production hosting secrets. The implementation tasks must be complete before beginning it.

## Dependencies

Run after #0477 and #0478.

## Activity

- 2026-09-21T12:09:32Z · created · unknown
- 2026-09-21T20:10:53Z · story

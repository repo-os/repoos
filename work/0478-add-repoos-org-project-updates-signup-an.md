---
id: "0478"
title: Add RepoOS.org project updates signup and confirmation UX
type: feature
status: inbox
priority: p2
area: landing
story: Email subscriber list
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-21T12:08:58Z"
updated_at: "2026-09-21T20:11:02Z"
---
## Problem

Once the subscription service exists, people visiting repoos.org need a clear, low-friction way to opt into occasional product updates and understand what they are signing up for.

## Desired UX

The landing page offers an unobtrusive Project updates signup near the existing calls to action. A visitor submits their email, sees that they must confirm it from their inbox, and returns to a clear success or failure state after using the confirmation link.

## Acceptance criteria

- [ ] Add a responsive Project updates signup component to `landing/`, using the existing visual language and preserving mobile overflow protections.
- [ ] The form states the promise plainly: occasional RepoOS product/release updates, with an unsubscribe link in every email.
- [ ] Validate email input client-side for fast feedback, then call the public Neon subscription endpoint; show pending, success, duplicate-pending/active, and recoverable failure states accessibly.
- [ ] Never expose Resend, Neon database, or webhook secrets in the landing bundle. The endpoint origin is public configuration only.
- [ ] The confirmation endpoint can redirect back to a landing-page confirmation state with clear confirmed, expired, already-used, and failed outcomes.
- [ ] Add focused component tests and run the landing build.
- [ ] Update the landing deployment/configuration documentation with the one required public endpoint variable.

## Notes for AI

Do not implement the service or recreate subscription state in the browser. Keep the form modest rather than turning the landing page into a newsletter application. Respect the existing static Cloudflare Pages deployment and zero horizontal overflow on narrow screens.

## Dependencies

Run after #0477 (Build Neon Functions double-opt-in updates service).

## Activity

- 2026-09-21T12:08:58Z · created · unknown
- 2026-09-21T20:11:02Z · story

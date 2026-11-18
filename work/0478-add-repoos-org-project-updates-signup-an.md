---
id: "0478"
title: Add RepoOS.org project updates signup and confirmation UX
type: feature
status: review
priority: p2
area: landing
story: Email subscriber list
assigned_to: ai
created_by: ""
branch: feat/add-repoos-org-project-updates-signup-an
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-09-21T12:08:58Z"
updated_at: "2026-11-18T02:05:39Z"
review_rounds: 1
review_passes: 1
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

## Shots
```json
[
{
"label": "Project updates signup by the closing call to action",
"target": "Landing page",
"route": "/",
"highlight": "#project-updates"
},
{
"label": "Expired confirmation with a path back to signup",
"target": "Landing page",
"route": "/?updates=expired",
"highlight": "#project-updates"
}
]
```

## Activity

- 2026-09-21T12:08:58Z · created · unknown
- 2026-09-21T20:11:02Z · story
- 2026-11-18T01:17:46Z · cli_override, model_override
- 2026-11-18T01:17:54Z · status inbox→ready
- 2026-11-18T01:17:59Z · status ready→active, branch
- 2026-11-18T01:24:00Z · body
- 2026-11-18T01:27:54Z · body
- 2026-11-18T01:33:23Z · body
- 2026-11-18T01:35:06Z · body
- 2026-11-18T01:38:30Z · CTO nudge: held — handoff gate is running
- 2026-11-18T01:49:40Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T01:49:43Z · status active→review
- 2026-11-18T01:49:43Z · message_queued at 2026-11-18T01:49:43.512Z
- 2026-11-18T01:53:04Z · note: review pass 1: needs some work
- 2026-11-18T01:53:04Z · message_delivered: 1 message(s)
- 2026-11-18T01:53:04Z · status review→active
- 2026-11-18T01:58:06Z · body
- 2026-11-18T02:00:42Z · body
- 2026-11-18T02:03:30Z · CTO nudge: held — handoff gate is running
- 2026-11-18T02:05:37Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-18T02:05:39Z · status active→review

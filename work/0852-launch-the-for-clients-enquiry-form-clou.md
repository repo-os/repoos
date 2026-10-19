---
id: "0852"
title: "Launch the For Clients enquiry form: Cloudflare secrets, bindings, deploy and a live mail test (human)"
type: chore
status: ready
hold: true
priority: p2
area: landing
depends_on: ["0849"]
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-19T13:28:08Z"
updated_at: "2026-10-19T19:15:05Z"
---
## Problem
#0849 landed the For Clients page and a Cloudflare Worker endpoint (`POST /api/enquiry`) that emails enquiries to hello@repoos.org through Resend. By design it fails closed (HTTP 503, no mail) until the production prerequisites exist, and none of them can be done by an AI agent or the test suite: they need Cloudflare and Resend dashboard access, a verified sending domain, and a real mailbox. #0849 documents them in landing/README.md ("Server and secrets") but nothing tracks them, so the form would silently stay off.

## Desired UX
A human works through this checklist once, in order, and the enquiry form goes live on repoos.org with a confirmed end-to-end delivery:
1. **Resend:** confirm the sending domain is verified in Resend and pick the sender (for example `RepoOS <hello@repoos.org>` on the verified domain); the existing `REPOOS_RESEND_API_KEY` is the key to use (do not paste it anywhere but the prompt below).
2. **Cloudflare Worker secrets** (from `landing/`, using the secure prompt): `bunx wrangler secret put REPOOS_RESEND_API_KEY` and `bunx wrangler secret put ENQUIRY_FROM`. Never put either in source, tasks, chat, TOML or a `VITE_*` variable.
3. **Rate-limit bindings:** confirm namespace IDs `84901` and `84902` in `landing/wrangler.jsonc` are unused by other services on the Cloudflare account (change them if not); both `ENQUIRY_RATE_LIMITER` and `ENQUIRY_GLOBAL_LIMITER` must exist or the form returns 503.
4. **Deploy:** push `main` (git-connected Cloudflare Workers build deploys it to landing-dev.repoos.org per the README branch table), run `cd landing && bunx wrangler deploy --dry-run` first if in doubt; confirm `/for-clients` and `/for-clients/` both load (the Worker's `run_worker_first` only covers `/api/*`, so deep links rely on Cloudflare's directory-index serving).
5. **Live test on the dev site:** submit a controlled enquiry; confirm it arrives at hello@repoos.org, that Reply goes to the entered work email, and that a second quick submit is blocked by the duplicate/rate-limit guards.
6. **Promote:** when satisfied, fast-forward `prod` from `main` (the documented deliberate step) and repeat a controlled test on repoos.org.
7. Record the result below (date, who, what was verified) and, if the dev and production Workers need separate secrets, note it in landing/README.md.

## Acceptance criteria
- [ ] Resend sender domain verified; `ENQUIRY_FROM` and `REPOOS_RESEND_API_KEY` set as Worker secrets (values never recorded anywhere).
- [ ] Rate-limit namespace IDs confirmed unused; both limiter bindings present on the deployed Worker.
- [ ] `/for-clients` and `/for-clients/` load on the deployed site; the form returns success only after Resend accepts.
- [ ] A controlled enquiry is received at hello@repoos.org with the correct Reply-To; duplicate and rate-limit behaviour confirmed.
- [ ] `prod` promoted and re-tested on repoos.org.

## Notes for AI
Human-only task: assigned to a human and held; do not dispatch an engineer. Source of truth for the steps is landing/README.md ("Deploy (Cloudflare)" and "For Clients and enquiries (#0849)"). Related but separate: #0848 (held showcase content), #0477-#0479 (project-updates signup, which also uses Resend and Cloudflare).

## Activity

- 2026-10-19T13:28:08Z · created · njachowski@gmail.com
- 2026-10-19T13:28:22Z · held, assigned_to
- 2026-10-19T19:15:05Z · status inbox→ready

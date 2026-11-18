## TL;DR

Task 0478 shipped the landing-page slice of the Project updates signup: a compact opt-in panel on repoos.org below the closing call to action, with client-side email validation, distinct pending/success/duplicate/failure states, service-redirect confirmation outcomes (`?updates=confirmed|expired|used|failed`), and a single public configuration variable (`VITE_PROJECT_UPDATES_ENDPOINT`) — no provider, database, or webhook secrets in the static bundle. Two engineering rounds were needed: the first passed review with findings (no request timeout, an always-failing form when the endpoint variable is unset, stale deployment docs), and the second fixed all of them and was verdict `good to go`. Close-out completed and the task was marked done with `release:success`. The upstream subscription service (#0477) was still unimplemented during this work, so the client is fail-closed and documents the contract the service must honor.

## Outcome

What shipped (merged as commit `ee04e978948e45dedc1364a1bcb2a4ea31bef6ea` on branch `feat/add-repoos-org-project-updates-signup-an`):

- A new `ProjectUpdatesSignup.vue` component on the landing page, placed beside the existing final install CTA, using the page's existing visual language and stacking to one column at narrow widths so horizontal-overflow protections hold.
- Native browser email validation for fast feedback, then a JSON POST to `/updates/subscribe` on the configured public origin. The form exposes new-pending, already-pending, already-active, and retryable-failure states, announced via live regions for assistive technology.
- Request lifecycle hardened in round 2 to match the sibling enquiry form: 15-second abort timeout, `AbortController` abort on unmount, and a mounted guard against late state updates.
- Fail-closed endpoint configuration: only an HTTPS origin (or `localhost` for development) with no path, credentials, query, or fragment is accepted; empty or malformed configuration renders a "temporarily unavailable" message instead of a form that always fails.
- Confirmation returns handled through four URL query states (`confirmed`, `expired`, `used`, `failed`) — expired/used/failed use the red theme token and offer a "Sign up again" path back to the form without inventing subscription state in the browser.
- `landing/README.md` updated with the Cloudflare Worker build-variable setup, the exact request/response contract (including 409 duplicates and 429 throttling), and cross-origin CORS preflight requirements for #0477.
- A focused test suite (`src/ui-app/tests/landing-updates.test.ts`, grown from 81 to 172 added lines across the two rounds) covering response branches, 409 duplicates, network rejection, and the unconfigured-endpoint path.

Final verdict: review pass 2 returned **`good to go`** (evidence-gap-only), the close-out gate completed successfully in 922 s, and the task closed as `done` with `release:success`.

## Process stats

- **Dev rounds:** 2 (both by the `codex` agent on model `gpt-6-luna`).
- **Review passes:** 2, both by the `reviewer` agent on model `opencode-go/deepseek-v4.1-flash` — pass 1 `needs some work`, pass 2 `good to go`.
- **Restarts or swaps:** none recorded; one `cli_override`/`model_override` event at task start (2026-11-18T01:17:46Z) set the engineer to `gpt-6-luna`.
- **Wall clock:** the task was created 2026-09-21T12:08:58Z but sat in `inbox` until 2026-11-18T01:17:54Z (`inbox→ready`); actual work ran from activation (`ready→active`, 01:17:59Z) to done (2026-11-18T05:21:29Z) — 4 h 3 m 30 s, derived from those recorded timestamps.
- **Recorded sessions** (from the session table):

| Role | Agent / model | Elapsed | Tokens | Cost |
| --- | --- | --- | --- | --- |
| engineer (round 1) | engineer / `gpt-6-luna` | 1799 s | 13,869,825 | not recorded |
| reviewer (pass 1) | reviewer / `opencode-go/deepseek-v4.1-flash` | 197 s | 62,272 | $0.021278909999999998 |
| reviewer (pass 2) | reviewer / `opencode-go/deepseek-v4.1-flash` | 168 s | 71,544 | $0.021762246 |
| debugger | debugger / `opencode-go/deepseek-v4.1-flash` | 9 s | not recorded | not recorded |
| routing ×2 | Model router (openrouter) / unknown | 1 s each | not recorded | not recorded |

- **Totals (sum of recorded values only):** 14,003,641 tokens and $0.043041156. The engineer's cost and the round-2 engineer session's tokens/elapsed were not recorded, so true totals are higher.
- **Close-out:** gate completed in 922 s on 2026-11-18T05:21:02Z; done at 05:21:29Z.

## What went wrong

- **Round 1 review findings (resolved in round 2).** Three bug classes: (1) no timeout/`AbortController` on the submit fetch — a hung endpoint left the form disabled in "Sending…" forever; fixed with a 15 s abort timeout plus unmount abort, matching `EnquiryForm.vue`. (2) A missing/malformed `VITE_PROJECT_UPDATES_ENDPOINT` shipped an enabled form that failed for every visitor; fixed with fail-closed parsing and a "temporarily unavailable" state. (3) Deployment docs pointed at the retired Cloudflare Pages flow; rewritten for the Wrangler Worker build, including the response contract and CORS preflight requirements.
- **Non-reproducing scoped-check contrast failure.** One round-1 check run reported 161 rendered contrast failures in the app's Jelly-dark scope (mainly settings labels). The isolated contrast audit passed and the full scoped check passed on the next run; no theme code was touched. Treated as a one-off browser audit failure — the engineer's lesson: reproduce in isolation before treating it as a regression.
- **Shot capture gaps.** The engineer's 390×844 capture attempt failed with "Authentication required" from the landing preview target (a local server was not started as a workaround). In pass 2, the declared signup shot showed the "temporarily unavailable" fallback rather than the form, because the endpoint variable was unset in the capture environment; the reviewer accepted this as an evidence gap only, since code and tests were sound. No re-capture was recorded.
- **Queued messages overdue.** Two `message_overdue` notes (2026-11-18T03:08:12Z and 03:57:36Z) record queued messages still undelivered after 60 m, after the pass-2 verdict. Their eventual delivery is not recorded in the log; the close-out gate completed normally afterward.
- **Unverifiable service contract.** Dependency #0477 was still `inbox` throughout, so no live endpoint, CORS behavior, inbox, Neon project, or Resend account could be exercised; all response parsing is fail-closed and mocked in tests.

## Learnings

- **Fail closed on public configuration.** A production static bundle can exist before its backing service does; absent or malformed public config should disable the feature, not ship a form that always fails. Belongs as a line in `docs/agent-ui-and-preview-conventions.md` if the pattern recurs.
- **A success response needs an explicit marker.** Any 2xx without a recognized status is treated as failure; generic success invites ambiguity between "new pending" and "already subscribed". The contract (including 409 duplicates and 429 copy) is now documented in `landing/README.md` for #0477 to match.
- **Confirmation is service-owned.** The landing page reports the redirect's result and offers a path back, but never infers activation from a click or an ambiguous response — the browser carries consent intent only, never subscription state.
- **Shot declarations should cover the configured path.** Declaring shots that depend on an env variable (the shot plan supports `env`) avoids capturing only the fallback. Worth a line in `docs/agent-ui-and-preview-conventions.md`.
- **Non-reproducing audit failures go to isolation first**, consistent with the existing guidance in `docs/debugging-check-failures.md` — no new rule needed.

## Follow-ups

None — no linked tasks were recorded for this task. Review pass 2 left three unfiled suggestions a future maintainer may still want: re-capture shot 1 with the endpoint env set (plus a 390 px layout), add `#project-updates` to the documented confirmation redirect (or scroll into view on `?updates=` mount), and note `localhost` (not `127.0.0.1`) for local `.env.local` testing. The substantive dependency remains #0477 implementing the documented request, response, CORS, and redirect contract, plus configuring the public origin in the Worker build environment.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.

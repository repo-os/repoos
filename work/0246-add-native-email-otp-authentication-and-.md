---
id: "0246"
title: Add native email OTP authentication and admin user allowlist
type: feature
status: active
priority: p2
area: web
assigned_to: unassigned
created_by: ""
branch: feat/add-native-email-otp-authentication-and-
model_override: default
pm_model_override: default
created_at: "2026-08-17T11:01:34Z"
updated_at: "2026-08-18T12:18:31Z"
---
## Problem

RepoOS currently lacks native authentication. Its UI, API, and SSE routes are publicly reachable, preventing a secure team deployment through a public Cloudflare Tunnel and blocking user-account features.

## Desired UX

When auth is enabled, a visitor sees a login page and can either receive an email one-time code or use Google OAuth. Only emails on the admin-managed allowlist can complete either method. A signed session then grants access according to the users admin or member role.

Admins manage members, roles, and auth settings from Settings. Cloudflare Tunnel can be public because RepoOS rejects anonymous traffic itself; Cloudflare Access remains optional defense in depth.

## Acceptance criteria

- [ ] Auth is opt-in and disabled by default, preserving current local single-user behavior. If an admin enables auth without a complete provider, session secret, and bootstrap-admin configuration, the server fails closed with an actionable startup error.
- [ ] Add a bootstrap-admin flow that cannot leave an enabled instance without an administrator.
- [ ] Provide email OTP request, verification, logout, expired-session, and login UI flows. Use Resend HTTP API as the initial email provider, behind a small provider interface.
- [ ] Provide Google OAuth authorization-code login when configured, with state/nonce/PKCE validation. A successful Google identity still must match the RepoOS allowlist.
- [ ] Persist users, roles, hashed single-use OTP challenges, and server-side session records across restarts. Never persist plaintext OTPs or session tokens.
- [ ] OTP codes expire after 10 minutes, are single-use, and have rate limits for request and failed-verification attempts by email and source address. Return non-enumerating responses.
- [ ] Add admin and member roles. Only admins may add, revoke, or change roles; prevent removal or demotion of the final admin. Record membership and role changes in an audit log.
- [ ] Protect every UI route, API route, and SSE stream with a valid session when auth is enabled. Unauthenticated API requests return 401; browser routes redirect to login. Explicitly document any intentionally public health endpoint.
- [ ] Use HttpOnly, Secure on HTTPS, and SameSite session cookies; rotate session identifiers at login, support logout, and enforce configurable expiry.
- [ ] Add Settings UI for user management: list users, add allowed emails, revoke access, and change roles.
- [ ] Keep all secrets server-side; do not expose provider credentials, OAuth secrets, or session secrets in the UI, task files, or browser payloads.
- [ ] Update the tunnel publishing assistant with a safe public-tunnel-plus-native-auth rollout and a clear distinction from Cloudflare Access.
- [ ] Add unit/integration coverage for OTP replay/expiry/rate limits, OAuth callback validation, authorization, sessions, SSE, bootstrap/admin edge cases, and denial of unauthenticated access.
- [ ] repoos check passes.

## Notes for AI

- Use native fetch for Resend and the OAuth exchanges: do not add runtime dependencies.
- Password login, self-service registration, additional email providers, SSO/SCIM/LDAP, and roles beyond admin/member are out of scope.
- Keep cloudflared and Cloudflare Tunnel unchanged; Cloudflare Access remains optional defense in depth.

## Activity

- 2026-08-17T11:07:31Z · body
- 2026-08-18T11:45:52Z · status ready→active, branch
- 2026-08-18T12:05:48Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-18T12:18:26Z · pm_model_override
- 2026-08-18T12:18:31Z · status review→active

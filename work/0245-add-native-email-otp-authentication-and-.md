---
id: "0245"
title: Add native email OTP authentication and admin user allowlist
type: feature
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-17T10:58:24Z"
updated_at: "2026-08-17T11:00:38Z"
---
## Problem

RepoOS is being shared with teammates through a public Cloudflare Tunnel. Cloudflare Access One-time PIN works but creates a separate, awkward identity setup. RepoOS needs its own authentication boundary and admin-controlled user allowlist before it can safely be published without Cloudflare Access.

## Desired UX

- A visitor to a protected RepoOS instance sees a login page, enters an allowed email address, and receives a short-lived one-time code.
- After entering the code, the visitor receives a secure session and can use the UI normally.
- Admins can view users, invite/allow an email, revoke access, and promote or demote another admin from Settings.
- Cloudflare Tunnel can be configured as public because RepoOS itself rejects anonymous requests.

## Acceptance criteria

- [ ] Add a configuration-backed native-auth mode that is disabled by default and fails closed when enabled but incomplete.
- [ ] Implement a bootstrap-admin flow that cannot accidentally leave a public instance without an administrator.
- [ ] Provide a login screen, email-code request and verification flow, logout, and an expired-session experience.
- [ ] Persist users, roles, session records, and hashed, single-use OTP challenges across server restarts; never persist plaintext codes or sessions.
- [ ] Restrict login-code delivery to the server allowlist. Add admin and member roles, with only admins able to manage users and auth configuration.
- [ ] Protect all UI routes, API mutation and read routes, and the SSE stream. Explicitly document any intentionally public health endpoint.
- [ ] Use HttpOnly, Secure (when HTTPS), SameSite cookie settings; rotate session identifiers on login; implement logout and session expiry.
- [ ] Rate-limit code requests and failed verification attempts per email and source address, use short code expiry, and return non-enumerating responses.
- [ ] Add an email-provider adapter with a first supported provider selected and documented. Secrets must remain server-side and absent from repoos.toml/task files/browser payloads.
- [ ] Add a Settings user-management UI with confirmation for revocation and safeguards against removing the final admin.
- [ ] Update the tunnel publishing assistant to clearly distinguish Cloudflare Access protection from public-tunnel plus RepoOS-native auth, and prevent/strongly warn about unsafe public exposure.
- [ ] Add unit and integration coverage for authentication, OTP replay/expiry/rate limits, authorization, SSE, session security, and bootstrap/admin edge cases.
- [ ] repoos check passes.

## Decisions needed before implementation

Choose the initial email delivery provider and its credential configuration. Recommended: Resend HTTP API, behind a provider interface, to avoid SMTP implementation complexity and preserve RepoOS zero runtime dependencies.

## Non-goals

- Password login, social sign-in, SSO, self-service registration, and organization/tenant isolation.
- Replacing cloudflared or Cloudflare Tunnel. Cloudflare Access remains an optional defense-in-depth layer.

## Activity

- 2026-08-17T11:00:38Z · body

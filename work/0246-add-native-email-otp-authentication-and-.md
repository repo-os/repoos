---
id: "0246"
title: Add native email OTP authentication and admin user allowlist
type: feature
status: ready
priority: p2
area: web
assigned_to: unassigned
created_by: ""
branch: ""
model_override: default
created_at: "2026-08-17T11:01:34Z"
updated_at: "2026-08-17T11:02:37Z"
---
## Problem

RepoOS currently lacks any authentication mechanism. All UI, API, and SSE routes are publicly accessible, which prevents secure deployment for teams and blocks any multi-user collaboration features. There is no way to control who can access a RepoOS instance or manage user membership.

## Desired UX

When authentication is enabled:

1. **Login flow**: User enters email → receives a one-time code → enters code → gains access via signed session cookie
2. **Admin allowlist**: Instance administrators can invite users by email, assigning roles (admin or member) through a Settings screen
3. **Role-based access**: Admins can manage membership; members can view/use the instance but not manage users
4. **Google OAuth alternative**: Users may optionally sign in with Google instead of email OTP
5. **Logout**: Clear session and return to login screen
6. **All routes protected**: Every UI page, API endpoint, and SSE stream requires valid authentication when auth is enabled
7. **Graceful degradation**: When no email provider is configured, auth is disabled and the instance behaves as it does today (fully open)

## Acceptance criteria

- [ ] Email OTP login: user enters email, receives code, enters code, gets session cookie
- [ ] OTPs are single-use, time-limited (10 min), and hashed at rest
- [ ] Rate limiting on OTP requests: max 5 per email per 15-minute window
- [ ] Session cookie is signed (HMAC) and has configurable expiry
- [ ] Admin allowlist: admin can add/remove users by email with roles (admin, member)
- [ ] Settings UI screen for user management (list, invite, remove, change role)
- [ ] Login/logout UI screens
- [ ] Google OAuth sign-in as an alternative auth method (when configured)
- [ ] All API routes return 401 when auth is enabled and session is invalid
- [ ] All SSE routes reject connections without valid session
- [ ] All UI routes redirect to login when session is missing/invalid
- [ ] Bootstrap-admin flow: first user to sign in with a configured bootstrap email becomes admin automatically
- [ ] Audit log for membership changes (who invited/removed whom, role changes)
- [ ] Tests proving unauthenticated requests cannot access any RepoOS endpoint when auth is enabled
- [ ] Documented public-tunnel rollout guide (e.g., for ngrok/cloudflare tunnel setups)

## Notes for AI

- **Email provider**: Start with Resend's HTTP API as the primary provider. It avoids SMTP complexity and aligns with RepoOS's zero-runtime-dependencies approach (Resend is a simple HTTP POST). If Resend is added, no new runtime deps are needed — use native `fetch`.
- **Google OAuth**: Add as a second auth provider option. Use the standard OAuth2 authorization code flow with native `fetch`. Store client ID/secret in config; no runtime deps needed.
- **Config**: Auth settings should live in the RepoOS config file (e.g., `auth.enabled`, `auth.email.provider`, `auth.email.resendApiKey`, `auth.google.clientId`, `auth.google.clientSecret`, `auth.bootstrapAdminEmail`, `auth.sessionSecret`, `auth.sessionExpiry`).
- **OTP storage**: Hash OTPs with SHA-256 before storing. Store in an in-memory map (or a simple JSON file if persistence across restarts is desired — pick the simpler option first).
- **Session storage**: In-memory session store keyed by signed token. No database dependency.
- **Files likely to touch**: `src/server/middleware.ts` (auth middleware), `src/server/routes/auth.ts` (new), `src/server/routes/admin.ts` (new), `src/core/config.ts` (auth config types), `src/ui-app/` (login, settings, user management components), `tests/` (auth integration tests).
- **Do NOT**: Add a database dependency. Do NOT add runtime npm packages. Do NOT break the existing non-auth flow — auth must be opt-in via config. Do NOT implement password-based auth. Do NOT store OTPs in plaintext.
- **Assumption**: The bootstrap-admin email is configured statically in the config file. The first time that email authenticates, they become admin. No pre-seeded user database.

## Scope

**In scope:**
- Email OTP authentication (Resend provider)
- Google OAuth authentication
- Admin allowlist with roles
- Login/logout UI
- Settings user-management screen
- Route protection (UI, API, SSE)
- OTP security (rate-limit, hash, expire, single-use)
- Session management (signed cookies)
- Audit logging for membership changes
- Bootstrap-admin flow
- Tests for unauthenticated access denial
- Public-tunnel rollout documentation

**Deferred:**
- Additional email providers beyond Resend (SMTP, SendGrid, etc.)
- Password-based authentication
- Multi-factor authentication beyond OTP
- User self-registration
- Role permissions beyond admin/member (e.g., read-only, write)
- Persistent user/OTP storage across restarts (use in-memory for v1)
- SCIM or LDAP integration

## Related

- None (initial auth implementation)

## Activity

- 2026-08-17T11:01:34Z · created · unknown
- 2026-08-17T11:01:40Z · model_override
- 2026-08-17T11:02:37Z · status inbox→ready

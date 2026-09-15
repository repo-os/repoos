# Authentication

**Auth is off by default.** A fresh `repoos init` ships with `auth.enabled`
false and the `[auth]` block commented out in `repoos.toml`, and most repos never
turn it on — the server serves straight to the app, with no login screen. Apart
from the section below on the dev backdoor, everything on this page describes
what happens *after* you enable it.

For the full list of fields and their defaults, see
[Configuration → Authentication](/configuration#authentication); this page is
about getting it running.

## Turning it on

At minimum, enabling auth needs a session setting, a login provider, and a way to
create the first admin:

```toml
auth.enabled        = true
auth.bootstrapAdmin = "you@example.com"   # the founding admin account
```

`bootstrapAdmin` is only used to claim the first account on a brand-new
instance. The server **refuses to start** with `auth.enabled = true` unless a
login method is configured and there's either a bootstrap admin or an existing
user — enabling auth can't silently lock everyone out.

Changes here take effect on the next `repoos serve`, not live.

## Email OTP with Resend

The default provider emails a one-time login code. RepoOS sends through
[Resend](https://resend.com), so you need an account and a verified sending
address:

```toml
auth.emailProvider.type        = "resend"
auth.emailProvider.fromAddress = "otp@send.example.com"
# auth.emailProvider.fromName = "My RepoOS"   # optional; defaults to "RepoOS at <repo>"
```

The API key is a secret and belongs in `.env`, not `repoos.toml`:

```bash
REPOOS_RESEND_API_KEY=re_...
```

RepoOS loads `.env` from the repo root at startup. Enter an allowlisted email on
the login page and it mails a six-digit code — valid for ten minutes, usable
once. The code is scoped to that repo, so if you run RepoOS on several, the email
names which one it's for.

## Sign in with Google

To add a **Sign in with Google** button alongside the email form, configure a
Google OAuth client. The client ID is not sensitive and goes in `repoos.toml`;
the client secret stays in `.env`:

```toml
auth.google.clientId = "....apps.googleusercontent.com"
```

```bash
REPOOS_GOOGLE_CLIENT_SECRET=...
```

The button only appears when both are set. Google sign-in doesn't bypass the
allowlist — an email still has to be added as a user (see below) before it can
log in.

## Users, roles and the allowlist

Only known users can sign in, by either method. The **first** user is the one who
claims the `bootstrapAdmin` email at the login page; after that, an admin manages
the allowlist from the UI — add or remove users, change roles, and re-send
invite emails. Roles are `admin` and `member`.

Two guardrails hold: the last admin can't be removed or demoted, and an invite
email needs an email provider configured (it's sent through the same Resend
setup).

## Sessions

A successful login sets an `HttpOnly` session cookie. Its lifetime is
`auth.sessionMaxAge`, which accepts either days or seconds — values under 300 are
read as days, larger values as seconds — and defaults to 30 days. RepoOS
generates a session secret at startup if you don't set
`REPOOS_AUTH_SESSION_SECRET`; you don't have to set one.

When auth is enabled, every request except the health check and the `/api/auth/*`
routes needs a valid session. Unauthenticated API calls get a `401`; browser
navigations land on the login page.

## Dev backdoor (local development only)

If you're developing against a RepoOS instance with auth turned on, you don't
need a real inbox to log in. Set a static code in `.env`:

```bash
REPOOS_AUTH_DEV_BACKDOOR_CODE=your-local-code
```

On the login page, request a code for an **already-allowlisted** email, then
enter the backdoor code in place of the emailed OTP. It replaces only the OTP
step — the resulting session is otherwise normal, and the email still has to be
in the allowlist; this is not a way to log in as an arbitrary address.

This is a development convenience with two hard limits, and it is **never a
production feature**:

- It is env-var only — RepoOS doesn't read it from `repoos.toml`, so it can't
  end up in a git-tracked config file.
- It is ignored whenever `NODE_ENV=production`. Both the config loader and the
  OTP verification step check this, so setting the variable on a production
  server does nothing.

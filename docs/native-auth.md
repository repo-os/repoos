# Native authentication

RepoOS ships its own login (email one-time code, plus optional Google
OAuth) so a deployment can sit behind a public [Cloudflare
Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
without being open to anyone who finds the URL. It's opt-in and off by
default — a fresh `repoos init` behaves exactly as before.

## Enable it

Add an `[auth]` section to `repoos.toml` at the repo root:

```toml
[auth]
enabled = true
bootstrapAdmin = "you@example.com"   # only this email can claim the founding admin account

[auth.emailProvider]
type = "resend"
fromAddress = "noreply@yourdomain.com"
fromName = "RepoOS"   # optional — without it, mail clients show the address's local part ("noreply") as the sender name
# apiKey = "re_..."   # or set REPOOS_RESEND_API_KEY instead — see "Secrets" below

# Optional — adds a "Sign in with Google" button. A successful Google
# identity still has to be on the allowlist to get in.
[auth.google]
clientId = "..."
# clientSecret = "..." # or REPOOS_GOOGLE_CLIENT_SECRET
```

`sessionSecret` is auto-generated on first boot if you leave it out.

This is a **restart-tier** setting — it's read once at startup, not
live-reloaded. The server validates it before binding and **fails to start**
if `enabled = true` without a working login provider (Resend or Google) or
without `bootstrapAdmin` set, so a bad config is loud, not silent.

## Secrets: keep them out of `repoos.toml`

`repoos.toml` is git-tracked. Real Resend/Google credentials belong in
environment variables instead, which win over the `repoos.toml` fields when
both are set:

| Env var | Overrides |
| --- | --- |
| `REPOOS_RESEND_API_KEY` | `[auth.emailProvider].apiKey` |
| `REPOOS_GOOGLE_CLIENT_SECRET` | `[auth.google].clientSecret` |
| `REPOOS_AUTH_SESSION_SECRET` | `[auth].sessionSecret` |

`repoos serve` auto-loads a `.env` file at the repo root if one exists (real
env vars set by your shell or process supervisor still take precedence over
it). `.env` is gitignored — see the `.env` written at the repo root for a
ready-made template with these three variables.

## Bootstrapping the first admin

Once auth is enabled and the server (re)starts, visiting `/login` on an
instance with zero users shows "Set up your admin account." Only the email
matching `bootstrapAdmin` is accepted — typing anything else is rejected.
Enter it and you're signed in immediately as admin, no OTP step needed for
that one-time action.

From there, **Settings → Authentication & Users** manages everyone else:
add allowed emails, change roles (admin/member), revoke access, and view
the audit log. The last admin can't be demoted or removed.

## What "enabled" actually protects

Every UI route, API route, and the SSE stream require a valid session once
auth is on. Unauthenticated API requests get `401`; browser navigation
redirects to `/login`. `/api/health` and `/api/auth/*` stay reachable
without a session (health checks, and the login flow itself obviously can't
require being logged in already).

Sessions are server-side (a hashed token in an `HttpOnly`, `SameSite=Lax`
cookie — `Secure` too when served over HTTPS), rotated on login, and expire
after `sessionMaxAge` seconds (default 7 days, configurable, minimum 300).

## Cloudflare Tunnel vs. Cloudflare Access

Native auth and Cloudflare Access solve overlapping problems from different
layers:

- **Native auth** (this doc) is RepoOS's own login, enforced by the RepoOS
  server itself. It's what makes it *safe* to point a public Cloudflare
  Tunnel at your instance — the tunnel can be public because RepoOS rejects
  anonymous traffic on its own.
- **Cloudflare Access** is a separate, optional layer that gates the tunnel
  itself before traffic ever reaches RepoOS (SSO, device posture, IP
  allowlists). It remains available as defense in depth and is unaffected
  by whether native auth is on.

You don't need Access to use native auth safely, and turning on native auth
doesn't require touching your tunnel or Access configuration at all — they
compose independently.

By default, `repoos tunnel create` **always** sets up a Cloudflare Access
policy for every app (an empty allowlist denies everyone — there's no way to
end up with a publicly reachable app through the normal flow). To actually
skip Access and rely on native auth alone, pass `--no-access` explicitly:

```bash
repoos tunnel create dev --port 7171 --domain dev.example.com --no-access
```

This refuses to run unless `auth.enabled = true` is already set — otherwise
the app would have no login at all, from either layer.

## Troubleshooting

- **Config changes not taking effect**: `[auth]` is restart-tier — restart
  the server (`POST /api/server/restart`, or the "New version available"
  button in the top bar if a build is parked). If nothing seems to have
  changed after a restart, check `GET /api/health`'s `buildHash` against a
  fresh `bun run build` in the checkout the server actually loads `dist/`
  from — a merge-to-`done` rebuilds it automatically, but a config-only
  restart with no code change won't produce a new hash to notice.
- **"Auth store unavailable"**: the server couldn't open its SQLite store.
  Check the process has write access to `.repoos/` in the repo root.
- **Bootstrap rejects your email**: it only accepts the exact
  `bootstrapAdmin` value from config (case-insensitive) — double check for
  typos or a stale config that wasn't reloaded.

# Native Hub capabilities

RepoOS Hub summaries use a separate, read-only device capability. A Hub
capability is not a browser session and must never be copied from, or used as,
the `repoos_session` cookie.

## Create a capability

Sign in to the server over its HTTPS origin, then explicitly create a
capability for this server:

```http
POST /api/auth/hub-capabilities
Authorization: <the normal authenticated server session>
Content-Type: application/json

{"label":"My Mac Hub","expiresInSeconds":2592000}
```

The response includes the plaintext `roh_…` token exactly once. Store it in
the macOS Keychain, associated with the exact canonical HTTPS origin. Do not
put it in browser local storage, a URL, a log, a task, or a WebKit bridge. The
server stores only a digest. The capability is limited to `summary:read`, is
audience-bound to `repoos-hub`, and expires no later than 90 days.

`GET /api/auth/hub-capabilities` lists metadata for the signed-in user's
capabilities, but never returns token material. A capability can be revoked
with `DELETE /api/auth/hub-capabilities/:id`. Rotation is an explicit
`POST /api/auth/hub-capabilities/:id/rotate`; the old token stops working
before the replacement is returned.

## Read the summary

The native client sends the token only to the exact HTTPS origin it is bound
to, using an Authorization header:

```http
GET /api/hub/v1/summary
Authorization: Bearer roh_…
```

The compact versioned response contains only `activeAgents`,
`reviewReadyTasks`, `needsInputTasks`, `generatedAt`, and `lastActivityAt`:

```json
{
  "apiVersion": "v1",
  "generatedAt": "2026-09-21T00:00:00.000Z",
  "lastActivityAt": "2026-09-20T23:59:00.000Z",
  "attention": {
    "activeAgents": 1,
    "reviewReadyTasks": 2,
    "needsInputTasks": 1
  }
}
```

The endpoint does not accept browser cookies, exposes no task contents or
filesystem paths, and is rate-limited. A `401` means the capability is
missing, expired, revoked, malformed, or being presented to another origin;
clients should remove the stored token after a confirmed revocation and ask
the user to create or rotate a new one.

Capability creation, rotation, and revocation audit entries contain only the
capability id, label, origin, and actor — never the bearer token.

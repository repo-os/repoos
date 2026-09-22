# Native Hub capabilities

RepoOS Hub summaries use a separate, read-only device capability. A Hub
capability is not a browser session and must never be copied from, or used as,
the `repoos_session` cookie.

## Local servers

For a server reached over loopback HTTP (`localhost`, `127.0.0.1`, or `::1`),
the Hub may read its bounded summary and task-search endpoints without a token.
The server verifies the actual socket peer — `::1`, `::ffff:127.0.0.1`, or a
`127.*` address — and never trusts the Host header or `X-Forwarded-*` headers,
so a proxy can never relabel a remote request as local. On the client, an
origin counts as loopback only when its scheme is `http` and its host is a
loopback host (`HubAccessPolicy.permitsLoopbackWithoutCapability`); everything
else must go through the capability flow. This makes the native per-server
"Enable attention and notifications" toggle work for normal local development
without a pairing ceremony. Remote origins still require a capability.

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
the macOS Keychain, associated with the exact canonical HTTPS origin
(`normalizeHubOrigin`: scheme `https`, lowercased host, default port elided,
no path, query, or userinfo). Do not put it in browser local storage, a URL, a
log, a task, or a WebKit bridge. The server stores only a digest. New
capabilities include `summary:read` and `search:read`, are audience-bound to
`repoos-hub` (protocol version 1), and expire after a lifetime clamped to at
least 300 seconds and at most 90 days (default 30 days).

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
the user to create or rotate a new one. The server derives the requesting
origin exactly as it did at creation (`capabilityRequestOrigin`: HTTPS via
`X-Forwarded-Proto`, plus the Host header) and compares it to the capability's
recorded origin, so a token copied to a different host or port stops working
immediately instead of leaking access.

## Search tasks (command palette)

Native Hub clients with the `search:read` scope may look up tasks directly:

```http
GET /api/hub/v1/tasks/search?q=privacy&limit=8
Authorization: Bearer roh_…
```

See [Native Hub cross-server task search](native-hub-cross-server-search.md) for
the privacy model, palette behavior, and response shape.

Capability creation, rotation, and revocation audit entries contain only the
capability id, label, origin, and actor — never the bearer token.

## Keep the protocol in sync

A change to the capability protocol touches more than the endpoints. Sweep all
of these in the same change:

- `src/core/hub-capabilities.ts` — the version, audience, scope, and TTL
  constants. Bump `HUB_CAPABILITY_VERSION` and add a migration if the meaning
  of stored rows changes; servers persist only the digest, so old tokens must
  either keep working or fail cleanly with a clear 401 that sends the user to
  rotate.
- `src/server/routes/hub.ts` — endpoint behavior, `isLoopbackPeer`, origin
  derivation, rate limits, and audit entries (always id/label/origin/actor,
  never token material).
- The Swift client — `HubSummaryClient` and `HubCrossServerTaskSearchEngine`
  (endpoints, scope, response shape), `HubCapabilityKeychain` (service
  `org.repoos.hub.capability`, keyed `serverID|origin`), and
  `HubAccessPolicy.permitsLoopbackWithoutCapability`, whose definition of
  "tokenless loopback" must stay the mirror of the server's `isLoopbackPeer`.
- The docs — this file, `native-hub-webkit.md`,
  `native-hub-cross-server-search.md`, and the user-facing guide
  `user-docs/macos-hub.md` (token lifecycle steps are instructions users rely
  on).
- Release notes for both the server and the Hub app; the two sides ship on
  different cadences, so a protocol change needs a compatibility window.

The compact response shape is additive — adding a field is safe; removing or
repurposing one is a v2 bump the Hub must be updated for in the same release.

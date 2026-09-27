# Telegram adapter — implementation notes (#0531)

Build context for the tasks that consume the local adapter (#0532–#0538,
#0559). The adapter lives in `src/server/telegram/`; routes are in
`src/server/routes/telegram.ts`. Read this before adding a second Telegram
call site — the point of the task was that there be none.

## Module layout

| File | Role |
| --- | --- |
| `telegram/types.ts` | Shared shapes: `TelegramProvider`, `ProvisionedBot`, `TelegramMessage`, `TelegramUpdate`, transport + provisioning types. Downstream tasks import from here; do not redefine equivalents. |
| `telegram/api.ts` | The only outbound Bot API client. `fetch`-injectable; every error is redacted. |
| `telegram/redact.ts` | Value-based token redaction bound to the live token. |
| `telegram/store.ts` | Encrypted connection record at `<root>/.repoos/telegram-bot.json` (mode 0600, `.repoos/` gitignored). |
| `telegram/normalize.ts` | Raw update → `TelegramUpdate`. Shared by both transports; returns `null` for payloads that cannot be acknowledged. |
| `telegram/polling.ts` | The long-polling loop (`getUpdates` + pointer). |
| `telegram/provider.ts` | `LocalTelegramProvider implements TelegramProvider`: connect/disconnect (BYO + managed redemption), profile configuration, send, intake, transport switching. |
| `telegram/provisioning.ts` | The `ProvisioningClient` boundary and its honest "not configured" client; #0559 supplies the hosted side. |
| `telegram/index.ts` | Per-repository provider singleton (`getTelegramProvider(config)`); `setTelegramProvider`/`resetTelegramProviders` for tests. |

## Security invariants (test-pinned)

1. **The token never leaves the server.** It is stored only inside an
   AES-256-GCM envelope (`#0530`'s `encryptSecret`, key from
   `REPOOS_SECRET_STORE_KEY`) inside the store file. No provider method
   returns it; no route response contains it, the webhook secret, or the
   envelope (`"ciphertext"` must not serialize to the browser). BYO tokens are
   never read from or written to `.env` — the task forbids plaintext env
   storage for imported credentials, and there is deliberately no
   `TELEGRAM_BOT_TOKEN` env fallback.
2. **Redaction by value everywhere.** The client's URL embeds the token (Bot
   API protocol), so every error message the client produces passes through
   `makeTokenRedactor(token)`, and the provider persists/passes along only
   redacted strings. Route bodies are additionally expected to stay
   credential-free (asserted in tests).
3. **Fail-closed storage.** Missing/invalid `REPOOS_SECRET_STORE_KEY` makes
   connect fail before anything is written, and makes `status()` report
   "cannot be decrypted" instead of pretending to be connected.

## Storage layout (`.repoos/telegram-bot.json`)

```json
{
  "version": 1,
  "source": "byo-token",
  "bot": { "id": 1, "username": "…", "displayName": "…", "canReadAllGroupMessages": false, "source": "byo-token", "connectedAt": "…" },
  "credential": { "version": 1, "algorithm": "aes-256-gcm", "iv": "…", "tag": "…", "ciphertext": "…" },
  "transport": { "mode": "off" },
  "profile": { "commands": [{ "command": "help", "description": "…" }] },
  "webhookSecret": null,
  "polling": { "lastUpdateId": null },
  "createdAt": "…", "updatedAt": "…"
}
```

Non-secret metadata is stored alongside so `status()` works without touching
the cipher; the plaintext token and webhook secret exist only in memory for
the duration of an outbound call. The file lives in the *serving* checkout —
task worktrees do not contain it even when they inherited the encryption key.

## Transport boundary

`TelegramProvider.handleUpdate(raw)` is the single intake point; the webhook
route (below) and the polling loop both feed it, so code above the adapter
cannot tell which transport delivered an update. `setTransport({mode})`
switches live: `polling` clears any webhook then starts the loop (the loop
also clears a stray webhook at start), `webhook` stops polling and calls
`setWebhook` with a generated secret token, `off` stops polling and deletes
the webhook. A connection starts with transport `off` — nothing polls until
an operator picks a transport.

**Boot resume.** After the server binds, `resumeTelegramTransports(config)`
(`src/server/telegram/index.ts`, called from `startServer`) re-arms the loop
when the stored transport is `polling` and the credential is readable; a 401
credential instead surfaces through `status()` without arming anything. The
loop gates on the live `[telegram] enabled` switch: while disabled it makes
no Telegram calls (paused at a 1s check interval) and resumes on its own when
the switch returns, so the toggle applies without a restart in both
directions. Webhook mode needs no boot action — Telegram delivers on its own
once #0532's route exists.

**Reconnect semantics.** `connectByBotToken` compares `getMe().id` with the
stored bot. A different bot resets the connection record's transport, webhook
secret, profile overrides, and polling pointer (update ids are per-bot); the
same bot keeps them, and any running loop is restarted so it holds the fresh
token's API client.

### Polling intake is at-least-once

`pollOnce` delivers the batch (awaited) *before* advancing the pointer, so a
crash mid-delivery leaves the update with Telegram for redelivery. A mid-loop
stop aborts the in-flight `getUpdates` instead of waiting out its 25s window.
Until #0533–#0535 make handlers idempotent-capable, correctness is easy: no
handler is registered, so redelivery is invisible.

### What #0532 must add: the webhook HTTP route

- Register a **public** route (add to `PUBLIC_PREFIXES` in `src/server/server.ts`
  with a comment explaining the ordering property) at a path that resolves the
  project from the URL, not from a client-supplied body field.
- On every request, compare the `X-Telegram-Bot-Api-Secret-Token` header with
  `provider`'s stored webhook secret (decrypt via
  `TelegramCredentialStore.readWebhookSecret()`) using
  `timingSafeEqualStr`; fail closed to a generic 403 that distinguishes nothing.
- Then call `await provider.handleUpdate(parsedBody)` and answer promptly
  (Telegram retries slow responses). The adapter drops anything it cannot
  normalize; you still respond 200 to avoid retry storms for goldfish.
- Reject oversized bodies before parsing.

### Bot profile: what is API-configurable and what is operator-only

Verified against the Bot API changelog (latest revision read 2026-09-28):

- API-configurable (adapter uses these): `setMyCommands`,
  `setMyName`, `setMyDescription`, `setMyShortDescription`,
  `setWebhook` (with `secret_token`, `allowed_updates`), `deleteWebhook`,
  `getWebhookInfo`, `getUpdates`, `sendMessage`.
- **Operator-only (BotFather), no API exists — never claim a toggle:**
  group **privacy mode** (BotFather; API only *reports* it via
  `getMe().can_read_all_group_messages` and BotFather requires re-adding the
  bot to groups after a change), inline-mode enablement, profile photo upload,
  and the deep-link/attachment features. The adapter deliberately preserves
  privacy mode (recommended default ON).

## Managed provisioning contract (`#0559` boundary)

Server-to-server HTTPS from the instance to the #0559 service:

```
POST {base}/v1/provisioning/requests
    body: { repository, instance: { id }, requestedBy, botNameHint? }
    → 200 { id, deep_link, expires_at }         # t.me/newbot deep link

GET  {base}/v1/provisioning/requests/{id}
    → 200 { id, state, deep_link, expires_at, bot?, error? }
      state ∈ pending | awaiting_bot_creation | ready | redeemed | expired | failed

POST {base}/v1/provisioning/requests/{id}/redeem
    headers: Authorization: Bearer <REPOOS_TELEGRAM_PROVISIONING_KEY>
    → 200 { token }        # single-use credential pickup, idempotent on retry
       409 already-redeemed (no second delivery)
```

Rules the client enforces (see `provisioning.ts`): missing `provisioningUrl`
or a missing/non-HTTP(S) base URL → `ManagedProvisioningNotConfiguredError`
("not configured" error mentioning BYO — a distinct class, so routes can
answer 501 while a configured service failing answers 502 without matching
message text); auth failures name `REPOOS_TELEGRAM_PROVISIONING_KEY` and
never echo the key; a response without a token redeems nothing and stores
nothing. The service sees repository/instance/admin identity only. The
provider funnels the redeemed token through the **same** `connectByBotToken`
path as BYO, so both provisioning sources produce one `ProvisionedBot`
shape. If validation or storage fails *after* a successful redeem (the
credential is single-use), the error says to redeem again within the
service's grace window — the contract replays the original result briefly
rather than issuing a second token. Tests exercise the whole contract
against a fetch-stubbed fake service (`fakeProvisioningService` in
`src/ui-app/tests/telegram-routes.test.ts`).

## Update intake invariant

Until #0533–#0535 register a handler via `provider.onUpdate(...)`, every
incoming update is normalized and dropped: nothing replies, nothing triggers,
nothing writes beyond the polling pointer. This is the ADR 0007 posture for
unbound senders, and the simplest proof that no update can disclose repository
data. When wiring handlers later, remember: authorization is per-message, live
from `auth_users`; a handler failure is logged redacted, never allowed to kill
the transport loop.

## The `[telegram] enabled` gate

`requireTelegramEnabled` (`src/server/routes/telegram.ts`) enforces the
master switch on every mutating connection route (connect, disconnect,
profile, transport, provision begin/status/redeem) with an honest 400; only
`GET /api/telegram/status` stays readable while disabled so the Settings
panel can render the switch and state. The enforcement is duplicated where
the traffic actually is: the polling loop pauses (no Telegram calls) while
`enabled` is false and resumes live when it flips back. Tests pin both
layers.

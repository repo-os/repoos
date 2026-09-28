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
| `telegram/commands.ts` | Read-only command handler (`/status`, `/tasks`, `/agents`, `/help`, #0540), registered as intake's `onAuthorized`. |
| `telegram/render.ts` | Command-side formatting: item pagination, "Showing N–M of T", Telegram's 4096-char clamp. |
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
    → 200 { id, deep_link, expires_at, link_code }   # deep link + /link code

GET  {base}/v1/provisioning/requests/{id}
    → 200 { id, state, deep_link, expires_at, link_code?, bot?, error? }
      state ∈ pending | awaiting_bot_creation | ready | redeemed | expired | failed
      link_code is present only while state = pending and the code is unconsumed

POST {base}/v1/provisioning/requests/{id}/redeem
    headers: Authorization: Bearer <REPOOS_TELEGRAM_PROVISIONING_KEY>
    → 200 { token }        # single-use credential pickup; replays within grace
       200 {}              # after grace or replay exhaustion — client maps to
                             ManagedRedemptionFollowUpError (not 409)

POST {base}/v1/provisioning/requests/{id}/rotate-token
    headers: Authorization: Bearer <REPOOS_TELEGRAM_PROVISIONING_KEY>
    → 200 { token }        # replaces the managed bot token via Telegram (#0539)
       409 when not yet redeemed

POST {base}/v1/provisioning/bots/{botId}/revoke
    headers: Authorization: Bearer <REPOOS_TELEGRAM_PROVISIONING_KEY>
    body: { repository, instance: { id } }
    → 200 { confirmed: true }   # managed-bot disconnect (#0539): the service
                                # rotates the bot token (Telegram has no
                                # revoke primitive) and purges any stored
                                # grace-window credential. 409/404/502 per
                                # state/ownership/Telegram failures.
```

Rules the client enforces (see `provisioning.ts`): missing `provisioningUrl`
or a missing/non-HTTP(S) base URL → `ManagedProvisioningNotConfiguredError`
("not configured" error mentioning BYO — a distinct class, so routes can
answer 501 while a configured service failing answers 502 without matching
message text); auth failures name `REPOOS_TELEGRAM_PROVISIONING_KEY` and
never echo the key; a 200 redeem response without a token is a
`ManagedRedemptionFollowUpError` — the request may already be consumed
server-side, so the error carries the grace-window replay hint; and the
response's optional `bot` summary is ignored in `redeem` (the provider
re-derives the authoritative bot from `getMe`), so a malformed summary can
never discard an already-delivered single-use credential — `getStatus` keeps
the strict validation for the browser-rendered view. The service sees
repository/instance/admin identity only. Managed disconnect (#0539) is the
revoke caller: `HttpProvisioningClient.revokeBot` posts
`/v1/provisioning/bots/{botId}/revoke` above, and disconnect treats a
confirmed response as revocation complete (it then clears local bindings and
the encrypted credential); BYO disconnect still requires BotFather-side
token revocation confirmed by a 401 probe, since Telegram exposes no
Bot API revoke for a plain bot token. The
provider funnels the redeemed token through the **same** `connectByBotToken`
path as BYO, so both provisioning sources produce one `ProvisionedBot`
shape. If validation or storage fails *after* a successful redeem (the
credential is single-use), the error says to redeem again within the
service's grace window — the contract replays the original result briefly
rather than issuing a second token. Tests exercise the whole contract
against a fetch-stubbed fake service (`fakeProvisioningService` in
`src/ui-app/tests/telegram-routes.test.ts`).

The #0559 service itself — the hosted implementation of this contract, its
correlation design (a Telegram deep link alone proves nothing; binding
happens via an explicit `/link <code>` message before bot creation), state
machine, credential handling, and deployment procedure — lives in
`telegram-manager/` as an isolated deployment boundary (own `package.json`,
never a dependency of the core package), documented in full in
`docs/telegram-manager-service.md`.

## Update intake invariant

The intake handler (`src/server/telegram/intake.ts`) is registered at boot via
`bootstrapTelegramAtBoot`. Every update passes through live authorization
(`resolveTelegramSender`), per-user and per-chat rate limits (in-memory,
per-process — not coordinated across multiple RepoOS processes), and audit
logging for privileged intake. Unbound or unauthorized senders are dropped
silently with no outbound Telegram traffic (ADR 0007). A handler failure is
logged redacted, never allowed to kill the transport loop.

## Read-only commands (#0540)

`bootstrapTelegramAtBoot(config, wiring)` registers
`createTelegramCommandHandler` (`src/server/telegram/commands.ts`) as the
intake `onAuthorized` callback when `startServer` passes `{ index, runner,
reviews, publicOrigin }`. It renders `/status`, `/tasks`, `/agents`, and
`/help` and sends through the same connected project bot. It never has a data
path of its own: it reads the in-process `LiveIndex`, `AgentRunner` (including
its small `recentlyFinished` tail, added for `/agents`), and `ReviewManager` —
the same sources the HTTP read routes serve — and resolves web links through
the notification provider's `webUiLink`, not a second origin rule. The
one-line task renderer reuses the notification `NotificationSpec` formatter.

- **Authorization is inherited, not re-implemented.** `onAuthorized` is only
  reached after a live `auth_users` lookup; an unbound sender, or one whose row
  was deleted, produces no reply at all. The command handler is never a place
  to add an access-denied response.
- **Role awareness is explicit.** `/help` states the sender's live role and
  what it can and cannot do, so a `member` learns the boundary exists instead
  of discovering it by refusal. `/tasks` defaults to the `work` scope
  (`active` + `review`) for both roles; arbitrary status queries are
  admin-only, and a member asking for one is told so.
- **Lists paginate.** `/tasks` shows "Showing N–M of T" and emits a
  `/tasks <scope> <page>` hint for the rest. `render.ts`'s `clampMessage` is a
  final safety net — if any message still exceeds Telegram's 4096 chars it is
  cut at a line boundary with an explicit truncation notice, never silently.
- **Per-chat serialization.** Concurrent commands in one chat run through a
  promise chain, so a group burst (notably over the concurrent webhook
  transport) cannot interleave two replies' lines. Group trigger rules are
  unchanged — they remain `isTelegramUpdateAddressedToBot`'s (#0535).

`startServer` passes the wiring; adapter tests that call
`bootstrapTelegramAtBoot(config)` without it get exactly #0534's behavior:
authorize, audit, drop.

## The `[telegram] enabled` gate

`requireTelegramEnabled` (`src/server/routes/telegram.ts`) enforces the
master switch on the mutating connection routes (connect, profile, transport
arm, provision begin/status/redeem, test-message) with an honest 400; only
`GET /api/telegram/status` stays readable while disabled so the Settings
panel can render the switch and state. Two safe-direction calls are
deliberately exempt: `transport {mode: "off"}` and `disconnect` — stopping
delivery or forgetting a credential must never require re-enabling the
integration. The enforcement is duplicated where the traffic actually is:
the polling loop pauses (no Telegram calls) while `enabled` is false and
resumes live when it flips back. Tests pin both layers.

## #0538: the Settings connection panel

`TelegramSettingsPanel.vue` (Settings → Notifications → Telegram) is the
admin-facing surface for everything above. It renders `GET
/api/telegram/status` (bot display name/username, source, transport mode —
never a token), and drives:

- **Connect Telegram** (managed provisioning) — `POST /api/telegram/provision`
  begins a request and opens its deep link; the panel polls `GET
  /api/telegram/provision/:id` every 2.5s and calls `POST
  /api/telegram/provision/:id/redeem` itself the moment the state reaches
  `ready`. A `managedProvisioning.configured: false` body (501) is shown as
  "not configured — use Bring Your Own Bot Token" rather than a bare error.
- **Bring Your Own Bot Token** — a password-type input posted once to `POST
  /api/telegram/connect`; the field is cleared immediately after the call
  resolves (success or failure) and the token never round-trips into a
  response the panel renders.
- **Disconnect** — `POST /api/telegram/disconnect`, confirmed, always
  available regardless of the enabled switch (see above).

### Test message (`POST /api/telegram/test-message`)

Body: `{ chatId: number, text?: string }`, admin-gated and enabled-gated like
the other mutating routes. `chatId` must already be a currently-bound chat —
the route looks it up with `AuthStore.getTelegramLink` and 404s otherwise, so
a test send can never reach an arbitrary numeric id an admin mistypes or
pastes from elsewhere (the same "binding is an admin action, not an
observation" boundary #0535 enforces for delivery, applied here to the send
path too). With no `text`, a default identifies the repository and confirms
delivery; Telegram's own (redacted) error text surfaces on failure via
`telegramErrorStatus`, per the task's "undiagnosable otherwise" requirement.

### Bound chats scope: private chats only, for now

The panel's bound-chats list and the test-message target picker both read
`GET /api/auth/telegram/links` (#0533) — one row per Telegram **user**
bound to an allowlisted email. In the Bot API a private chat's `chat_id`
equals that user's numeric id, so today every bound row *is* a sendable
private chat and this is a complete, correct "bound chats" view. **Group/
supergroup chat binding is #0535's `telegram_user_links`-adjacent table,
which had not landed on `main` when this task shipped** (still `review` at
the time); there is no `telegram_group_links`-shaped storage to read yet.
When #0535 lands, extend this list (and the test-message picker) to include
bound groups from its storage — do not invent a second, parallel "chats"
concept; the picker should grow one more row source, not a second UI.
Unbinding here calls the *same* `DELETE /api/auth/telegram/links/:id` route
Settings → Security → Authentication & Users uses, so the two surfaces are
always one live source, never a cached copy of each other (the task's own
requirement).

### Config treatment for this task

No new `repoos.toml` keys: `telegram.enabled` (live-tier, existing) already
gates every route this task adds, and `telegram.provisioningUrl` (TOML-only,
existing deliberate exception — see `user-docs/configuration.md`) already
documents the provisioning-service URL this panel's "Connect Telegram" button
depends on. The bot token itself has no TOML key at all, by design (see
"Secrets stay env-only" in the task) — it never touches `repoos.toml`; it is
POSTed once and stored only in the encrypted `.repoos/telegram-bot.json`
record. There is nothing here to add a Settings *schema* control for beyond
the switch that already exists — the connect/status/test-message controls
this task adds are actions and live state, not configuration.

## Recovery from a corrupt connection record

`TelegramCredentialStore.load()` validates the full record shape (version,
bot, credential, transport, profile, polling pointer, webhook secret, disconnect progress) and
fails loudly with the file path and what is wrong — `status()` surfaces it as
a 500-class error with an actionable message. Recovery never requires hand-
deleting the file: `connect` can replace it wholesale. `disconnect` preserves
an unreadable record and refuses to report success because the token cannot be
verified or revoked.

## Disconnect (#0539)

`disconnect` is one ordered operation — complete or loudly incomplete:

1. Stop polling and remove the webhook while its token still works. Confirm
   removal with `getWebhookInfo`; unauthorized responses are failures, not
   proof of removal. Persist only this confirmed progress so a retry can safely
   continue after revocation.
2. Revoke a managed bot through the provisioning service. Telegram has no Bot
   API operation to revoke a BYO token: RepoOS removes its webhook, instructs
   the admin to revoke the token in @BotFather, then requires a 401 probe of
   that old token on retry. `logOut`/`close` are not token revocation.
3. Only after revocation is confirmed, atomically revoke this instance's user
   and chat bindings, delete its invites, and write the audit record.
4. Delete the encrypted credential only if it is still the exact credential
   that was just revoked; connect and disconnect operations are serialized so
   a reconnect cannot be deleted by an older disconnect.

All binding rows carry `instance_identity` and use composite keys, so different
instances can bind the same Telegram user or chat in a shared auth database.
The cleanup and disconnect audit are one SQLite transaction. A failed Telegram
step, unreadable local record, database failure, or credential change returns
a visible retryable error; the encrypted connection remains available for
retry. `POST /api/telegram/disconnect` and
`POST /api/auth/telegram/disconnect` share the same implementation.

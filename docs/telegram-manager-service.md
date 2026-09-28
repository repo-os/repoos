# Telegram manager-bot provisioning service (#0559)

This is the deployment/architecture doc for the standalone service that owns
the official RepoOS Telegram manager bot and hands each newly provisioned
project bot's token to the correct local RepoOS instance. It is the
server-side half of the contract `src/server/telegram/provisioning.ts`
implements — read `docs/telegram-adapter.md` first for the client side and the
wire contract this service must match exactly.

The service lives entirely under `telegram-manager/`: its own `package.json`,
lockfile, `tsconfig.json` and dependencies (`hono`, `pg`), isolated from the
root RepoOS package the same way `landing/` and `mobile/` are. This keeps the
core package's zero-runtime-dependency constraint intact — nothing here is a
dependency of `repoos` itself, and Bring Your Own Bot Token usage never needs
this service or its dependencies installed.

**This doc describes what to build and how to deploy it. It does not
authorize provisioning real Neon resources.** The operator supplies the Neon
project, the pooled connection string, the four secrets below, and the
manager bot itself, then runs the deploy steps in this doc.

## Why this service has to exist

A Telegram "Managed Bots" creation link
(`https://t.me/newbot/<manager_username>/<new_username>`) carries **no
correlation or start parameter** — Telegram's managed-bot deep link format is
just a suggested username, unlike normal bot deep links which support
`?start=`. Tapping it and creating a bot produces no proof of *who* did it or
*which* pending request it belongs to. A naive design that matched incoming
`managed_bot` events by username or creation order could hand one instance's
brand-new bot token to a different instance's provisioning request. The
mitigation is the `/link <code>` step below.

## Correlation design: the `/link` code

1. An instance calls `POST /v1/provisioning/requests` (via
   `HttpProvisioningClient` — already built in #0531). The service creates a
   `pending` row with a random `id` (32 random bytes, base64url — treated as a
   bearer secret) and a short, human-typeable `link_code` (8 unambiguous
   base32-ish characters, no `0/O/1/I`), and returns a `deep_link` plus that
   `link_code` for the RepoOS UI to display.
2. The admin messages the manager bot directly: `/link <code>`. The manager
   bot records **who sent that message** (the Telegram user id) against the
   matching `pending` row and moves it to `awaiting_bot_creation`. The code is
   single-use: once consumed it can never bind another request, and a wrong or
   already-used code is rejected with a courtesy reply and an audit entry
   (`link_rejected`), never a state change.
3. Only *after* that binding does the admin tap the deep link and create the
   bot. When Telegram delivers the resulting `managed_bot` update to the
   manager bot's webhook, the service matches it to a request **by the
   Telegram user id recorded in step 2** — never by bot username, bot id, or
   arrival order. An unmatched `managed_bot` event (no pending
   `awaiting_bot_creation` row for that user) is logged (`bot_created_unmatched`)
   and otherwise ignored; it does not create or bind anything.
4. The request becomes `ready`; `GET /v1/provisioning/requests/{id}` starts
   returning the bot summary. The instance calls
   `POST /v1/provisioning/requests/{id}/redeem` to fetch the actual bot token.

This means the manager bot token and the admin's Telegram identity are both
required to bind a request, and the request `id` (a 256-bit secret,
functionally equivalent to a bearer token — see below) is required to redeem
it. An attacker needs all of: the manager bot's webhook (Telegram-only), the
admin's Telegram account, and the instance auth key.

## Why the request `id` is a bearer secret, and the auth key is shared

The task's own wording ("service-to-instance auth key", singular) points at
one shared secret between every RepoOS instance and the manager service,
rather than a per-instance-issued credential. Combined with that, redemption
security rests on the request `id` itself being unguessable (32 random bytes,
base64url) — knowledge of a valid `id` *and* the shared instance auth key is
sufficient to redeem. This is deliberately simple for a v1: it match the
task's stated credential model, and the `id` is never logged, echoed in error
bodies, or derivable from anything public (not the link code, not the deep
link, not the bot username). If a stronger per-instance credential model is
needed later (e.g. so one compromised instance can't redeem another's
requests), that's a follow-up, not a blocker here — the state machine doesn't
change, only what's checked before allowing a redeem.

## State machine

```
pending -> awaiting_bot_creation -> ready -> redeemed
   |                |                  |
   +------- expired (TTL) -------------+
                                        |
                                     failed (Telegram error during redeem)
```

- `pending`: created, waiting for `/link <code>`. TTL: 15 minutes
  (`REQUEST_TTL_MS`), after which the whole request expires regardless of
  link-code state.
- `awaiting_bot_creation`: `/link` consumed, waiting for the `managed_bot`
  webhook event. The link code itself additionally has its own 10-minute TTL
  (`LINK_CODE_TTL_MS`) — a code that isn't used in time cannot bind a request
  even if the request's own 15-minute TTL hasn't elapsed yet.
- `ready`: bot created and matched; the encrypted token has **not** been
  fetched from Telegram yet. `GET .../requests/{id}` returns the bot summary
  here.
- `redeemed`: `POST .../redeem` has successfully returned the token at least
  once. Internally there's a transient `redeeming` CAS-lock state between
  `ready` and `redeemed` (see below); it's never exposed on the wire — the
  client only ever observes `pending | awaiting_bot_creation | ready |
  redeemed | expired | failed`, per the #0531 contract.
- `expired`: the 15-minute TTL elapsed before the bot was created (or before
  it was ever redeemed). Terminal.
- `failed`: reserved for a Telegram-side error surfaced permanently (e.g. the
  manager bot lost Bot Management Mode access); a *transient* Telegram error
  during redeem instead reverts `redeeming` -> `ready` so a retry can succeed
  cleanly, rather than failing the whole request.

Both TTLs and the state machine are enforced with **passive expiry** — applied
on every read (`getById`, `beginRedeem`) — so correctness never depends on a
background job running. `POST /v1/maintenance/sweep` (instance-auth protected)
exists as defense-in-depth to bulk-expire rows, purge spent redemption
envelopes past their grace window, and prune old dedup rows; see
[Recommended: wire the sweep to a cron trigger](#recommended-wire-the-sweep-to-a-cron-trigger).

## Redemption and the replay grace window

`redeem()` acquires an exclusive lock with an atomic
`UPDATE ... WHERE state = 'ready' RETURNING *` (compare-and-swap) — never a
long-held database transaction spanning the external Telegram HTTP call. On
success:

1. The manager bot calls Telegram's managed-bot token method.
2. The token is encrypted at rest (AES-256-GCM, `TELEGRAM_MANAGER_ENCRYPTION_KEY`)
   and the row transitions to `redeemed` with a `grace_until` timestamp five
   minutes in the future (`REDEEM_GRACE_MS`).
3. If the instance's HTTP call to `/redeem` was itself dropped/retried (network
   blips are the norm, not the exception, for this kind of handoff), a second
   `POST .../redeem` within the grace window decrypts and replays the **same**
   token — no second Telegram API call, no new credential minted.
4. Past the grace window the encrypted envelope is purged (lazily on next
   read, or in bulk by `sweep()`). A `/redeem` call after that point returns a
   plain `200` with **no** `token` field. This is intentional and matches the
   already-shipped client's exact expectation
   (`ManagedRedemptionFollowUpError` in `src/server/telegram/provisioning.ts`)
   — it is not an error response, it's "you already got this, and it's gone
   now."

If the Telegram call in step 1 fails, the CAS lock is released back to
`ready` (never `failed`) so a subsequent `/redeem` can retry cleanly instead of
wedging the request in a permanently broken state.

## Rate limiting

Two independent limits, both enforced in the store so they hold across
restarts:

- **`begin`**, per instance id: 5 requests / 60s. Exceeding it is a
  `429 rate_limited` from `POST /v1/provisioning/requests`.
- **`/link` attempts**, per Telegram user id: 10 / 60s. This bounds brute-force
  guessing of another admin's link code from the same Telegram account; it
  does not block the request itself (a rejected guess never touches state),
  only floods of guesses.

## Duplicate Telegram updates (at-least-once webhook delivery)

Telegram's webhook delivery is at-least-once, not exactly-once. Every inbound
update is deduplicated by `update_id` (`telegram_update_dedup` table, 7-day
retention swept by `sweep()`) **before** it reaches the service's business
logic, so a redelivered `/link` message or `managed_bot` event is acknowledged
with `200` but processed at most once — this is asserted in
`tests/http.test.ts`.

## Secrets

Never in the repo, the image, or a function's committed config. Local dev
copies live in `telegram-manager/.env` (gitignored — see `.env.example` for
what to generate and how). In production every one of these is a Neon
Functions deploy-time env var, injected via `neon deploy --env KEY=value` or
declared in `neon.ts`'s `env` field reading from `process.env` at deploy-config
evaluation time — see the important Neon-vs-Cloudflare distinction below.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon's own pooled connection string. Auto-injected by Neon Functions when Postgres is enabled on the branch; only needs to be set by hand for local dev. |
| `TELEGRAM_MANAGER_BOT_TOKEN` | The official manager bot's token (Bot Management Mode enabled in BotFather). Never distributed to repository instances — that's the entire point of this service existing. |
| `TELEGRAM_MANAGER_BOT_USERNAME` | The manager bot's `@username`, used to build the `t.me/newbot/<username>/...` deep link. |
| `TELEGRAM_MANAGER_WEBHOOK_SECRET` | Passed to Telegram's `setWebhook` as `secret_token`; verified against `X-Telegram-Bot-Api-Secret-Token` on every inbound webhook call, timing-safe. |
| `TELEGRAM_MANAGER_INSTANCE_AUTH_KEY` | The shared service-to-instance auth key. Configured on each RepoOS instance as `REPOOS_TELEGRAM_PROVISIONING_KEY` (see `user-docs/telegram.md`). |
| `TELEGRAM_MANAGER_ENCRYPTION_KEY` | AES-256-GCM key (32 bytes, hex or base64) used only to encrypt the transient token envelope during the replay grace window. Generate with `openssl rand -hex 32`. |

## Hosting: Neon Functions + Neon Postgres

This decision is closed (human decision, 2026-09-28) — see the task spec for
the full rationale (one platform, one account, covers the upcoming email-list
story too). What follows are the concrete, **currently-verified** (checked
against Neon's live docs, not the superseded beta announcement) facts this
implementation depends on, plus where they differ from Cloudflare Workers —
which this service does **not** use, but which the task explicitly asked to
call out wherever the difference matters:

- **Runtime: Node.js 24 only**, JS/TS. A Neon Function's entry point is a
  default export shaped `{ fetch(request): Response | Promise<Response> }`.
  Hono apps satisfy this directly (`app.fetch`) — Hono is Neon's own
  recommended framework, which is why this service is built on it rather than
  a bespoke router. See `src/index.ts`.
- **No distinct "secret" storage type.** Unlike Cloudflare Workers'
  `wrangler secret put` (an encrypted store separate from plain vars), Neon
  Functions has one mechanism: environment variables set at deploy time
  (`neon deploy --env KEY=value`, or `neon.ts`'s `env` field, itself just
  reading `process.env` when the deploy config is evaluated). Treat every
  value in the secrets table above as equally sensitive regardless of this —
  never commit real values to `neon.ts`, only the `requireDeployEnv()` lookup
  that reads them from the deployer's own shell/CI environment at deploy time.
- **Functions run in the same region/branch as the Postgres database** they're
  attached to, with `DATABASE_URL`/`DATABASE_URL_UNPOOLED` auto-injected —
  there's no separate "which region is my function in vs. my database"
  question to answer, unlike a Cloudflare Worker talking to a database in a
  different provider/region entirely.
- **Long-running/streaming-capable, but still serverless: idle instances get
  evicted.** The service must be — and is — fully stateless between requests
  except for a memoized cold-start connection pool (`src/index.ts`); nothing
  is cached in memory across requests that isn't safe to lose and rebuild.
- **Deploy tooling**: `neon deploy`, configured by `neon.ts` (using the real
  `@neon/config` npm package — a dev-only dependency of `telegram-manager/`,
  never installed into the root package). One function (`manager`) is
  declared, sourced from `src/index.ts`.
- **Must be verified live at deploy time, not assumed from this doc**: current
  Neon Functions region availability, request/compute limits, and pricing.
  Region/limits/pricing move independently of this doc and the operator is
  the one actually creating the Neon project — check `neon.tech/docs` at that
  point rather than trusting a number written here.

## Deployment procedure

None of this has been run as part of building this service — it's the
handoff to whoever owns the operator-side Neon account and the manager bot.

1. **Create the manager bot.** In BotFather: create a bot, then enable **Bot
   Management Mode** (`/setinline`-style BotFather flag documented at
   `core.telegram.org/bots/features#managed-bots`). Record its token and
   `@username`.
2. **Create the Neon project** (or branch) this service will run against.
   Enable Postgres if not already on by default.
3. **Set secrets** in the deploying shell/CI environment (never in the repo):
   `TELEGRAM_MANAGER_BOT_TOKEN`, `TELEGRAM_MANAGER_BOT_USERNAME`,
   `TELEGRAM_MANAGER_WEBHOOK_SECRET` (generate: `openssl rand -hex 32`),
   `TELEGRAM_MANAGER_INSTANCE_AUTH_KEY` (generate: `openssl rand -hex 32`),
   `TELEGRAM_MANAGER_ENCRYPTION_KEY` (generate: `openssl rand -hex 32`).
4. **Run migrations** against the Neon Postgres connection string:
   ```bash
   cd telegram-manager
   bun install --frozen-lockfile
   DATABASE_URL=<neon pooled connection string> bun run migrate
   ```
5. **Deploy**:
   ```bash
   bunx neon deploy   # reads neon.ts; requires the env vars from step 3
   ```
6. **Register the webhook** once the function's public URL is known (Neon
   prints it on deploy): call Telegram's `setWebhook` for the manager bot with
   `url = <function url>/v1/telegram/webhook` and
   `secret_token = TELEGRAM_MANAGER_WEBHOOK_SECRET`. `HttpTelegramManagerClient`
   in `src/telegram-client.ts` exposes this as `setWebhook()` — a one-off
   script or `bunx tsx -e` invocation calling it is sufficient; this service
   does not re-register its own webhook automatically on every boot (a
   function that did that on every cold start would fight Telegram's own
   webhook rate limits for no benefit).
7. **Wire the sweep to a schedule** — see below.
8. **Point RepoOS instances at it**: set `[telegram] provisioningUrl` to the
   function's URL and `REPOOS_TELEGRAM_PROVISIONING_KEY` to the same value as
   `TELEGRAM_MANAGER_INSTANCE_AUTH_KEY` (`user-docs/telegram.md` has the
   instance-side instructions).

### Recommended: wire the sweep to a cron trigger

`POST /v1/maintenance/sweep` (instance-auth protected) bulk-expires overdue
rows, purges spent redemption envelopes past their grace window, and prunes
dedup rows older than 7 days. Passive expiry on read means correctness never
depends on this running, but without it the table grows unboundedly and spent
envelopes linger longer than necessary. Neon Functions supports scheduled
invocation via Function Triggers (cron) — wire one to call this route on an
hourly cadence, verified live against Neon's current Triggers docs at deploy
time (this doc doesn't hardcode the exact trigger syntax since it's not part
of what this task builds or tests).

## Migration / rollback procedure

`telegram-manager/scripts/migrate.ts` is a small, dependency-free (beyond
`pg`) runner:

- `bun run migrate` (`up`): creates a `schema_migrations` tracking table if
  absent, then applies every `migrations/*.sql` file not yet recorded, in
  filename order, each inside its own transaction.
- `bun run migrate:down` (`down`): re-runs the most recently applied
  migration's paired rollback. Every migration file's rollback lives in the
  same `.sql` file after a `-- rollback` marker line (statements below it are
  parsed by stripping the `-- ` prefix and executed in a transaction), so a
  migration and its own undo can never drift into separate files that get out
  of sync.
- Both commands take `DATABASE_URL` from the environment — point it at the
  target database explicitly rather than relying on any default.

Current migrations: `migrations/0001_init.sql` — creates
`provisioning_requests`, `telegram_update_dedup`, `rate_limit_counters`, and
`audit_log`.

## Testing

`telegram-manager/tests/` (vitest) runs entirely against
`InMemoryProvisioningStore` and a `FakeTelegramManagerClient` — no real
Postgres or Telegram API calls. Coverage includes the full happy path,
cross-instance/cross-repository claim isolation, grace-window replay vs.
post-grace tokenless redemption, request and link-code expiry, wrong/missing
auth key and wrong webhook secret (impersonation), duplicate webhook update
handling, simulated process-restart recovery (a fresh `ProvisioningService`
constructed over the same store), and per-instance/per-user rate limiting.
`PgProvisioningStore` mirrors the same CAS semantics using
`UPDATE ... WHERE state = $expected RETURNING *`, but is not exercised against
a live database by this test suite (no Postgres dependency in CI); it should
be smoke-tested against a real Neon Postgres branch before first production
deploy.

## Known assumptions requiring live verification before production deploy

Documented here rather than guessed at with false confidence, per the task's
own instruction to prefer an explicit "verify live" flag over fabricating a
detail:

- The exact JSON field names Telegram sends in a `managed_bot` webhook update,
  and the exact request/response shape of the token-retrieval method (assumed
  `getManagedBotToken` taking a bot id) — `src/telegram-client.ts` has an
  inline doc comment marking this. Confirm against
  `core.telegram.org/bots/api` and `#managed-bots` at deploy time and adjust
  the normalizer/client if the live shape differs.
- Current Neon Functions region availability, limits, and pricing (see above).

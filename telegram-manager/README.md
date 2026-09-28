# telegram-manager

The Telegram manager-bot provisioning service for #0559. Owns the official
RepoOS manager bot and hands each provisioned project bot's token to the
correct RepoOS instance. Full architecture, security rationale, and
deployment procedure: [`docs/telegram-manager-service.md`](../docs/telegram-manager-service.md).

This directory is an isolated deployment boundary — its own `package.json`,
lockfile, and `tsconfig.json` — exactly like `landing/` and `mobile/`. Nothing
here is a dependency of the root `repoos` package.

## Quickstart

```bash
bun install --frozen-lockfile
cp .env.example .env   # fill in the generated secrets; see the file for how
bun run migrate        # applies migrations/*.sql against $DATABASE_URL
bun run smoke:pg       # race-safety smoke test of PgProvisioningStore SQL
bun run build          # tsc --noEmit
bun run test           # vitest, runs entirely against in-memory fakes
```

Local dev needs a real Postgres reachable at `DATABASE_URL` for
`bun run migrate` (a Neon branch, or any local Postgres) — the test suite
itself needs no database. There's no `bun run dev` server here yet; running
the function locally means invoking `src/index.ts`'s exported `fetch` handler
directly, or a Neon Functions local-dev command verified at deploy time (see
the doc above).

## Layout

- `src/types.ts` — wire-format types, deliberately independent of
  `src/server/telegram/types.ts` in the main package.
- `src/config.ts` — env loading (fails loudly if a required secret is missing).
- `src/crypto.ts` — token envelope encryption, id/code generation, redaction.
- `src/store.ts` / `memory-store.ts` / `pg-store.ts` — the storage boundary
  (state machine, dedup, rate limits, audit log) and its two implementations.
- `src/telegram-client.ts` — the manager bot's own Telegram API calls.
- `src/service.ts` — orchestration: `begin` / `getStatus` / `handleUpdate`
  / `redeem` / `rotateToken` / `revokeBot` (the #0539 disconnect contract) /
  `sweep`.
- `src/http.ts` — the Hono app implementing the exact `/v1/provisioning/*` and
  `/v1/telegram/webhook` contract `src/server/telegram/provisioning.ts` (in the
  main package) already consumes.
- `neon.ts` / `src/index.ts` — Neon Functions deploy config and entry point.
- `scripts/migrate.ts` — up/down migration runner.
- `migrations/*.sql` — schema, each with a paired `-- rollback` section.
- `tests/` — vitest, against `InMemoryProvisioningStore` + a fake Telegram
  client; no real network or database calls.

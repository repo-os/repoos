/**
 * Neon Function entry point: a default export with `fetch(request)` is the
 * whole contract (neon.com/docs/compute/functions/overview, read
 * 2026-09-28). Config, the DB pool, and the Telegram client are constructed
 * once per cold start and reused across invocations on the same instance —
 * standard for long-running Node.js serverless compute, and cheaper than
 * reconnecting Postgres per request.
 */
import { Pool } from "pg";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";
import { PgProvisioningStore } from "./pg-store.js";
import { createTelegramManagerClient } from "./telegram-client.js";

let appPromise: ReturnType<typeof buildApp> | null = null;

async function buildApp() {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const store = new PgProvisioningStore(pool);
  const telegram = createTelegramManagerClient(config.managerBotToken, config.telegramApiBase);
  return createApp({ config, store, telegram });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (!appPromise) appPromise = buildApp();
    const app = await appPromise;
    return app.fetch(request);
  },
};

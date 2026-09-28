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
  const telegram = createTelegramManagerClient(
    config.managerBotToken,
    config.telegramApiBase,
    fetch,
    config.telegramApiTimeoutMs,
  );
  return createApp({ config, store, telegram });
}

async function getApp() {
  if (!appPromise) {
    appPromise = buildApp().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const app = await getApp();
    return app.fetch(request);
  },
};

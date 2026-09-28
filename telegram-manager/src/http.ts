/**
 * HTTP wiring (Hono — the framework Neon Functions recommends: a Hono app's
 * default export already satisfies the `fetch(request): Response` handler
 * shape Neon Functions require). Maps `ServiceError` kinds to status codes
 * and produces exactly the wire shapes `provisioning.ts` (in the main
 * package) expects — see `docs/telegram-manager-service.md#http-contract`.
 */
import { Hono, type Context, type Next } from "hono";
import { timingSafeEqual } from "node:crypto";
import type { ManagerConfig } from "./config.js";
import { ProvisioningService, ServiceError } from "./service.js";
import type { ProvisioningStore } from "./store.js";
import type { TelegramManagerClient } from "./telegram-client.js";
import type {
  BeginRequestBody,
  BeginResponseBody,
  ErrorResponseBody,
  RedeemResponseBody,
  StatusResponseBody,
} from "./types.js";

export interface AppDeps {
  config: ManagerConfig;
  store: ProvisioningStore;
  telegram: TelegramManagerClient;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function errorStatus(kind: ServiceError["kind"]): 400 | 404 | 409 | 410 | 429 | 502 {
  switch (kind) {
    case "invalid":
      return 400;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "gone":
      return 410;
    case "rate_limited":
      return 429;
    case "upstream":
      return 502;
  }
}

export function createApp(deps: AppDeps) {
  const service = new ProvisioningService(
    deps.store,
    deps.telegram,
    deps.config,
    deps.config.managerBotUsername,
  );
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true }));

  const instanceAuth = async (c: Context, next: Next) => {
    const header = c.req.header("Authorization") ?? "";
    const expected = `Bearer ${deps.config.instanceAuthKey}`;
    if (!header || !timingSafeEqualStr(header, expected)) {
      const body: ErrorResponseBody = { error: "invalid or missing instance authentication" };
      return c.json(body, 401);
    }
    await next();
  };

  app.use("/v1/provisioning/*", instanceAuth);

  app.post("/v1/provisioning/requests", async (c) => {
    // The instance's own identity comes from the request body (`instance.id`)
    // per the #0531 client contract, not from the (shared) auth header — see
    // docs/telegram-manager-service.md#why-the-auth-key-is-shared.
    const body = (await c.req.json().catch(() => null)) as BeginRequestBody | null;
    if (!body || typeof body.instance?.id !== "string" || !body.instance.id) {
      const err: ErrorResponseBody = { error: "instance.id is required" };
      return c.json(err, 400);
    }
    try {
      const result = await service.begin(body.instance.id, body);
      const response: BeginResponseBody = {
        id: result.id,
        deep_link: result.deepLink,
        expires_at: result.expiresAt,
        link_code: result.linkCode,
      };
      return c.json(response, 200);
    } catch (e) {
      if (e instanceof ServiceError) {
        const err: ErrorResponseBody = { error: e.message };
        return c.json(err, errorStatus(e.kind));
      }
      throw e;
    }
  });

  app.get("/v1/provisioning/requests/:id", async (c) => {
    try {
      const status = await service.getStatus(c.req.param("id"));
      const response: StatusResponseBody = {
        id: status.id,
        state: status.state,
        deep_link: status.deepLink,
        expires_at: status.expiresAt,
        ...(status.bot
          ? {
              bot: {
                id: status.bot.id,
                username: status.bot.username,
                display_name: status.bot.displayName,
                source: "managed" as const,
              },
            }
          : {}),
        ...(status.error ? { error: status.error } : {}),
      };
      return c.json(response, 200);
    } catch (e) {
      if (e instanceof ServiceError) {
        const err: ErrorResponseBody = { error: e.message };
        return c.json(err, errorStatus(e.kind));
      }
      throw e;
    }
  });

  app.post("/v1/provisioning/requests/:id/redeem", async (c) => {
    try {
      const result = await service.redeem(c.req.param("id"));
      const response: RedeemResponseBody | Record<string, never> = result.token
        ? { token: result.token }
        : {};
      return c.json(response, 200);
    } catch (e) {
      if (e instanceof ServiceError) {
        const err: ErrorResponseBody = { error: e.message };
        return c.json(err, errorStatus(e.kind));
      }
      throw e;
    }
  });

  // Public: Telegram calls this directly, authenticated by the secret token
  // header instead of the instance bearer key.
  app.post("/v1/telegram/webhook", async (c) => {
    const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!timingSafeEqualStr(secret, deps.config.webhookSecret)) {
      return c.body(null, 403);
    }
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw || typeof raw.update_id !== "number") {
      // Acknowledge anyway — Telegram retries a non-200 response, and an
      // unparseable body will never become parseable on retry.
      return c.json({ ok: true }, 200);
    }
    const isNew = await deps.store.seeUpdate(raw.update_id, new Date());
    if (isNew) {
      await service.handleUpdate(raw);
    }
    return c.json({ ok: true }, 200);
  });

  // Maintenance sweep. Wire a Neon Function Trigger (cron) at this path in
  // production; see docs/telegram-manager-service.md#scheduled-maintenance.
  app.post("/v1/maintenance/sweep", instanceAuth, async (c) => {
    const touched = await service.sweep();
    return c.json({ ok: true, touched }, 200);
  });

  return app;
}

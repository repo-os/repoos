/**
 * Inbound Telegram Bot API webhook (#0532).
 *
 * Publicly reachable when session auth is on — the route validates Telegram's
 * secret-token header before reading the body, then hands the update to the
 * adapter intake path. No session cookie, no Hub capability, no repo data in
 * responses.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqualStr } from "../../core/auth.js";
import { instanceIdentity } from "../../core/telegram-identity.js";
import type { RouteHandler } from "./types.js";
import { getTelegramProvider } from "../telegram/index.js";
import { TelegramCredentialStore } from "../telegram/store.js";

/** Header Telegram sends on every webhook delivery (case-insensitive on the wire). */
export const TELEGRAM_WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Telegram updates are small; cap body size on this unauthenticated route. */
export const TELEGRAM_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

/** Path segment after `/api/telegram/webhook/` — the stable instance id for this checkout. */
export function telegramWebhookPathForRoot(repoRoot: string): string {
  return `/api/telegram/webhook/${instanceIdentity(repoRoot)}`;
}

function forbidden(res: ServerResponse): void {
  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Forbidden");
}

function headerSecretToken(req: IncomingMessage): string | null {
  const raw = req.headers[TELEGRAM_WEBHOOK_SECRET_HEADER];
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}

function webhookSecretMatches(req: IncomingMessage, expected: string | null): boolean {
  if (!expected) return false;
  const provided = headerSecretToken(req);
  if (!provided) return false;
  return timingSafeEqualStr(provided, expected);
}

async function readJsonBodyLimited(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: "too_large" }> {
  const declared = req.headers["content-length"];
  if (declared !== undefined) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0 || n > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    // Unparseable payloads are dropped by normalization; still acknowledge.
    return { ok: true, value: {} };
  }
}

export const telegramWebhook: RouteHandler = async (ctx, req, res, params) => {
  if (ctx.config.telegram?.enabled !== true) {
    forbidden(res);
    return;
  }

  const instanceParam = params.param1 ?? "";
  const expectedInstance = instanceIdentity(ctx.config.root);
  if (!instanceParam || !timingSafeEqualStr(instanceParam, expectedInstance)) {
    forbidden(res);
    return;
  }

  const store = new TelegramCredentialStore(ctx.config.root);
  let transportMode: string | undefined;
  try {
    transportMode = store.load()?.transport.mode;
  } catch {
    forbidden(res);
    return;
  }
  if (transportMode !== "webhook") {
    forbidden(res);
    return;
  }

  const expectedSecret = store.readWebhookSecret();
  if (!webhookSecretMatches(req, expectedSecret)) {
    forbidden(res);
    return;
  }

  const body = await readJsonBodyLimited(req, TELEGRAM_WEBHOOK_MAX_BODY_BYTES);
  if (!body.ok) {
    res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Payload Too Large");
    return;
  }

  const provider = getTelegramProvider(ctx.config);
  await provider.handleUpdate(body.value);

  res.writeHead(200);
  res.end();
};

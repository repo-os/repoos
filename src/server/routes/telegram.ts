/**
 * Admin HTTP surface for the local Telegram adapter (#0531).
 *
 * These routes carry the connection lifecycle: connect a BYO bot token,
 * disconnect, read status, configure the bot's profile, switch the update
 * transport, and the three managed-provisioning calls (begin / status /
 * redeem) that #0538's Connect Telegram UI will drive. All are admin-gated
 * via the same `requireAdmin` pattern as the user-management routes.
 *
 * Security invariants enforced here:
 *  - No route ever echoes the bot token, the webhook secret token, or the
 *    encrypted envelope to the client. The connect response contains only the
 *    ProvisionedBot summary; the token stays on the server (encrypted at
 *    rest, decrypted only to make an outbound API call).
 *  - Error text is redacted at the adapter layer (value-based token
 *    redaction), so an upstream failure can never leak the token through a
 *    JSON error body.
 *  - When auth is disabled (trusted single-operator instance), the routes
 *    behave like every other admin action in RepoOS: the server is already
 *    serving an unauthenticated API, so the gate treats the caller as the
 *    operator and records a null actor in audit entries.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types.js";
import type { AuthRole } from "../../core/auth.js";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { requireAdmin } from "./auth.js";
import { getTelegramProvider } from "../telegram/index.js";
import { ManagedProvisioningUnavailableError } from "../telegram/provisioning.js";
import { TelegramApiError, TelegramNetworkError } from "../telegram/api.js";
import { TelegramCredentialDecryptError, TelegramStoreCorruptError } from "../telegram/store.js";
import { TelegramNotConnectedError, TelegramValidationError } from "../telegram/provider.js";
import type {
  ProvisionedBot,
  ProvisioningRequestView,
  TelegramProfileInput,
  TelegramTransportMode,
} from "../telegram/types.js";

/**
 * Admin gate for Telegram connection management. `requireAdmin` semantics
 * when auth is enabled; when auth is disabled the instance's API is already
 * open (the middleware only gates when auth.enabled), so the operator is the
 * caller — consistent with how the config PATCH route treats an auth-off box.
 */
function requireTelegramAdmin(
  req: IncomingMessage,
  config: RepoOSConfig,
  res: ServerResponse,
): { email: string; role: AuthRole } | null {
  if (config.auth?.enabled !== true) {
    return { email: "", role: "admin" as AuthRole };
  }
  return requireAdmin(req, config, res);
}

/** Body field guards; responders never echo credential-shaped input back. */
function requireString(
  body: Record<string, unknown>,
  key: string,
  res: ServerResponse,
): string | null {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    json(res, 400, { error: `${key} must be a non-empty string` });
    return null;
  }
  return value.trim();
}

/** Map provider failures onto honest HTTP statuses with redacted messages. */
function telegramErrorStatus(e: unknown): { status: number; error: string } {
  if (e instanceof TelegramNetworkError) {
    return { status: 502, error: e.message };
  }
  if (e instanceof TelegramApiError) {
    // 401 invalid token / 429 rate limit / other API errors: the description
    // is Telegram's own, already redacted client-side.
    return { status: e.code === 429 ? 429 : 400, error: e.message };
  }
  if (e instanceof TelegramCredentialDecryptError) {
    return { status: 500, error: e.message };
  }
  if (e instanceof TelegramStoreCorruptError) {
    return { status: 500, error: e.message };
  }
  if (e instanceof TelegramValidationError || e instanceof TelegramNotConnectedError) {
    // Operator-input and lifecycle problems: honest 400/409 at the route.
    return { status: 400, error: e.message };
  }
  return { status: 500, error: e instanceof Error ? e.message : String(e) };
}

export const telegramStatus: RouteHandler = (ctx, req, res) => {
  if (!requireTelegramAdmin(req, ctx.config, res)) return;
  try {
    const provider = getTelegramProvider(ctx.config);
    return json(res, 200, provider.status());
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
};

/**
 * BYO connect: validate the token against Telegram and store it encrypted.
 * After the credential lands, the default bot profile is applied best-effort
 * (`/help` + a repository description) — profile failures surface as
 * `warnings` rather than failing the connection. The raw token arrives once,
 * server-side only; the response carries the ProvisionedBot summary, and the
 * token is never readable back.
 */
export const telegramConnect: RouteHandler = async (ctx, req, res) => {
  const admin = requireTelegramAdmin(req, ctx.config, res);
  if (!admin) return;
  const body = (await readBody(req)) as Record<string, unknown>;
  const token = requireString(body, "token", res);
  if (!token) return;
  try {
    const provider = getTelegramProvider(ctx.config);
    const bot = await provider.connectByBotToken(token);
    const warnings: string[] = [];
    try {
      await provider.applyDefaultProfile();
    } catch (e) {
      warnings.push(`bot profile setup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return json(res, 200, { ok: true, bot, warnings });
  } catch (e) {
    const { status, error } = telegramErrorStatus(e);
    return json(res, status, { error });
  }
};

export const telegramDisconnect: RouteHandler = async (ctx, req, res) => {
  const admin = requireTelegramAdmin(req, ctx.config, res);
  if (!admin) return;
  try {
    const provider = getTelegramProvider(ctx.config);
    await provider.disconnect();
    return json(res, 200, { ok: true, status: provider.status() });
  } catch (e) {
    const { status, error } = telegramErrorStatus(e);
    return json(res, status, { error });
  }
};

export const telegramProfile: RouteHandler = async (ctx, req, res) => {
  const admin = requireTelegramAdmin(req, ctx.config, res);
  if (!admin) return;
  const body = (await readBody(req)) as Record<string, unknown>;
  const input: TelegramProfileInput = {};
  for (const key of ["name", "description", "shortDescription"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string") {
        return json(res, 400, { error: `${key} must be a string` });
      }
      input[key] = body[key] as string;
    }
  }
  if (body.commands !== undefined) {
    if (!Array.isArray(body.commands)) {
      return json(res, 400, { error: "commands must be an array" });
    }
    const commands: { command: string; description: string }[] = [];
    for (const raw of body.commands) {
      const row = (raw ?? null) as Record<string, unknown> | null;
      if (
        !row ||
        typeof row.command !== "string" ||
        !row.command.trim() ||
        typeof row.description !== "string" ||
        !row.description.trim()
      ) {
        return json(res, 400, { error: "each command needs command and description strings" });
      }
      const command = row.command.trim().replace(/^\//, "").toLowerCase();
      commands.push({ command, description: row.description.trim() });
    }
    input.commands = commands;
  }
  if (Object.keys(input).length === 0) {
    return json(res, 400, {
      error: "provide at least one of name, description, shortDescription, commands",
    });
  }
  try {
    const provider = getTelegramProvider(ctx.config);
    const profile = await provider.configureProfile(input);
    return json(res, 200, { ok: true, profile });
  } catch (e) {
    const { status, error } = telegramErrorStatus(e);
    if (e instanceof TelegramNotConnectedError) {
      return json(res, 409, { error: e.message });
    }
    return json(res, status, { error });
  }
};

export const telegramTransport: RouteHandler = async (ctx, req, res) => {
  const admin = requireTelegramAdmin(req, ctx.config, res);
  if (!admin) return;
  const body = (await readBody(req)) as Record<string, unknown>;
  const mode = body.mode as TelegramTransportMode | undefined;
  if (mode !== "off" && mode !== "polling" && mode !== "webhook") {
    return json(res, 400, { error: 'mode must be "off", "polling", or "webhook"' });
  }
  let webhookUrl: string | undefined;
  if (body.webhookUrl !== undefined) {
    if (typeof body.webhookUrl !== "string" || !/^https?:\/\//i.test(body.webhookUrl.trim())) {
      return json(res, 400, { error: "webhookUrl must be an absolute URL" });
    }
    webhookUrl = body.webhookUrl.trim();
  }
  try {
    const provider = getTelegramProvider(ctx.config);
    const transport = await provider.setTransport({ mode, webhookUrl });
    return json(res, 200, { ok: true, transport });
  } catch (e) {
    const { status, error } = telegramErrorStatus(e);
    if (e instanceof TelegramNotConnectedError) {
      return json(res, 409, { error: e.message });
    }
    return json(res, status, { error });
  }
};

// ---------------------------------------------------------------------------
// Managed provisioning (#0531 client boundary; #0559 supplies the service).
// Every call reports unavailability honestly; BYO is unaffected throughout.
// ---------------------------------------------------------------------------

export const telegramProvisionBegin: RouteHandler = async (ctx, req, res) => {
  const admin = requireTelegramAdmin(req, ctx.config, res);
  if (!admin) return;
  const body = (await readBody(req)) as Record<string, unknown>;
  const botNameHint = typeof body.botNameHint === "string" ? body.botNameHint.trim() : undefined;
  try {
    const provider = getTelegramProvider(ctx.config);
    const request = await provider.beginManagedProvisioning({
      adminEmail: admin.email || "trusted-operator",
      botNameHint: botNameHint || undefined,
    });
    // begin() returns { id, deepLink, expiresAt } — presented in the same
    // ProvisioningRequestView shape the status route answers with.
    return json(res, 200, {
      ok: true,
      request: requestView(request, null) as ProvisioningRequestView,
    });
  } catch (e) {
    return provisioningError(res, e);
  }
};

export const telegramProvisionStatus: RouteHandler = async (ctx, req, res, params) => {
  const admin = requireTelegramAdmin(req, ctx.config, res);
  if (!admin) return;
  const id = params.param1;
  try {
    const provider = getTelegramProvider(ctx.config);
    const request: ProvisioningRequestView = await provider.getManagedProvisioningStatus(id);
    return json(res, 200, { ok: true, request: requestViewOf(request) });
  } catch (e) {
    return provisioningError(res, e);
  }
};

export const telegramProvisionRedeem: RouteHandler = async (ctx, req, res, params) => {
  const admin = requireTelegramAdmin(req, ctx.config, res);
  if (!admin) return;
  const id = params.param1;
  try {
    const provider = getTelegramProvider(ctx.config);
    const bot: ProvisionedBot = await provider.redeemManagedCredential(id);
    // Same shape as BYO connect — provisioning paths converge here (#0531).
    return json(res, 200, { ok: true, bot });
  } catch (e) {
    return provisioningError(res, e);
  }
};

function requestView(
  begin: { id: string; deepLink: string; expiresAt: string },
  extra: { state?: ProvisioningRequestView["state"]; bot?: ProvisionedBot; error?: string } | null,
): ProvisioningRequestView {
  return {
    id: begin.id,
    state: extra?.state ?? "pending",
    deepLink: begin.deepLink,
    expiresAt: begin.expiresAt,
    ...(extra?.bot ? { bot: extra.bot } : {}),
    ...(extra?.error ? { error: extra.error } : {}),
  };
}

function requestViewOf(view: ProvisioningRequestView): ProvisioningRequestView {
  return view;
}

function provisioningError(res: ServerResponse, e: unknown): void {
  if (e instanceof ManagedProvisioningUnavailableError) {
    const unavailable = e.message.includes("not configured");
    json(res, unavailable ? 501 : 502, {
      error: e.message,
      managedProvisioning: { configured: !unavailable },
      byoAvailable: true,
    });
    return;
  }
  const { status, error } = telegramErrorStatus(e);
  json(res, status, { error });
}

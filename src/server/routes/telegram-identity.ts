/**
 * Admin-only Telegram identity binding routes (#0533).
 *
 * Invite creation is authenticated web Settings. Redeem happens on the bot
 * /start path (see redeemTelegramInvite) — not over these HTTP routes.
 */

import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { getAuthStore } from "../../core/auth-store.js";
import { isValidEmail } from "../../core/auth.js";
import { getCurrentUser } from "./auth.js";
import {
  bindTelegramChatDirect,
  chatBindContextFromConfig,
  chatTypeMatchesTelegramChatId,
  createTelegramChatBindCode,
  listTelegramChatsForSettings,
  setTelegramChatNotificationsEnabled,
  unbindTelegramChat,
} from "../../core/telegram-chat.js";
import {
  createTelegramInvite,
  instanceIdentity,
  listTelegramLinksForSettings,
  reassignTelegramUser,
  repositoryIdentity,
  telegramInviteSecret,
  unbindTelegramUser,
} from "../../core/telegram-identity.js";

function requireAdmin(
  req: Parameters<RouteHandler>[1],
  config: Parameters<RouteHandler>[0]["config"],
  res: Parameters<RouteHandler>[2],
) {
  const user = getCurrentUser(req, config);
  if (!user) {
    json(res, 401, { error: "Authentication required" });
    return null;
  }
  if (user.role !== "admin") {
    json(res, 403, { error: "Admin access required" });
    return null;
  }
  return user;
}

function parseTelegramUserId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

function parseTelegramChatId(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id === 0) return null;
  return id;
}

function inviteContext(root: string, secret: string) {
  return {
    secret,
    repoIdentity: repositoryIdentity(root),
    instanceIdentity: instanceIdentity(root),
  };
}

/** POST /api/auth/telegram/invites  { email } */
export const createTelegramInviteRoute: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const secret = telegramInviteSecret(config.auth?.sessionSecret);
  if (!secret) return json(res, 500, { error: "Invite signing is not configured" });

  const body = (await readBody(req)) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return json(res, 400, { error: "Valid email address required" });
  }

  const created = createTelegramInvite(store, inviteContext(config.root, secret), {
    email,
    createdBy: admin.email,
  });
  if ("error" in created) {
    if (created.error === "not_allowlisted") {
      return json(res, 404, { error: "User not found" });
    }
    if (created.error === "invalid_email") {
      return json(res, 400, { error: "Valid email address required" });
    }
    return json(res, 500, { error: "Failed to create invite" });
  }

  return json(res, 200, {
    ok: true,
    email: created.email,
    startPayload: created.nonce,
    expiresAt: created.expiresAt,
    deepLink: created.deepLink,
  });
};

/** GET /api/auth/telegram/links */
export const listTelegramLinksRoute: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  return json(res, 200, { links: listTelegramLinksForSettings(store) });
};

/** DELETE /api/auth/telegram/links/:telegramUserId */
export const unbindTelegramLinkRoute: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const url = new URL(req.url ?? "/", "http://localhost");
  const id = parseTelegramUserId(decodeURIComponent(url.pathname.split("/").pop() ?? ""));
  if (id === null) return json(res, 400, { error: "Invalid Telegram user id" });

  const unbound = unbindTelegramUser(store, id, admin.email);
  if (!unbound) return json(res, 404, { error: "Link not found" });
  return json(res, 200, { ok: true });
};

/** POST /api/auth/telegram/links/:telegramUserId/reassign  { email } */
export const reassignTelegramLinkRoute: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);
  const idRaw = segments[segments.length - 2] ?? "";
  const id = parseTelegramUserId(decodeURIComponent(idRaw));
  if (id === null) return json(res, 400, { error: "Invalid Telegram user id" });

  const body = (await readBody(req)) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const result = reassignTelegramUser(store, {
    telegramUserId: id,
    email,
    actorEmail: admin.email,
  });
  if ("error" in result) {
    if (result.error === "invalid_email") {
      return json(res, 400, { error: "Valid email address required" });
    }
    if (result.error === "not_allowlisted") {
      return json(res, 404, { error: "User not found" });
    }
    if (result.error === "store") {
      return json(res, 500, { error: "Auth store unavailable" });
    }
    return json(res, 404, { error: "Link not found" });
  }
  return json(res, 200, { ok: true, email: result.email });
};

/** POST /api/auth/telegram/chats/bind-codes — short-lived code for /bind in a group */
export const createTelegramChatBindCodeRoute: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const ctxBind = chatBindContextFromConfig(config.root, config.auth?.sessionSecret);
  if (!ctxBind) return json(res, 500, { error: "Chat bind signing is not configured" });

  const created = createTelegramChatBindCode(store, ctxBind, { createdBy: admin.email });
  if ("error" in created) return json(res, 500, { error: "Failed to create bind code" });

  return json(res, 200, {
    ok: true,
    code: created.code,
    expiresAt: created.expiresAt,
    command: `/bind ${created.code}`,
  });
};

/** GET /api/auth/telegram/chats */
export const listTelegramChatsRoute: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  return json(res, 200, { chats: listTelegramChatsForSettings(store) });
};

/** POST /api/auth/telegram/chats  { telegramChatId, chatType?, title? } */
export const bindTelegramChatRoute: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const body = (await readBody(req)) as Record<string, unknown>;
  const idRaw = body.telegramChatId;
  const telegramChatId =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string"
        ? parseTelegramChatId(idRaw.trim())
        : null;
  if (telegramChatId === null) {
    return json(res, 400, { error: "telegramChatId must be a numeric chat id" });
  }
  const chatTypeRaw = typeof body.chatType === "string" ? body.chatType.trim() : "";
  if (telegramChatId < 0 && !chatTypeRaw) {
    return json(res, 400, { error: "chatType is required for group and channel chat ids" });
  }
  const chatType = chatTypeRaw || "private";
  if (!chatTypeMatchesTelegramChatId(telegramChatId, chatType)) {
    return json(res, 400, { error: "chatType does not match telegramChatId" });
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;

  const bound = bindTelegramChatDirect(store, {
    telegramChatId,
    chatType,
    title,
    actorEmail: admin.email,
  });
  if (!bound) return json(res, 500, { error: "Failed to bind chat" });
  return json(res, 200, { ok: true, chat: bound });
};

/** PATCH /api/auth/telegram/chats/:telegramChatId  { notificationsEnabled: boolean } */
export const patchTelegramChatNotificationsRoute: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const url = new URL(req.url ?? "/", "http://localhost");
  const id = parseTelegramChatId(decodeURIComponent(url.pathname.split("/").pop() ?? ""));
  if (id === null) return json(res, 400, { error: "Invalid Telegram chat id" });

  const body = (await readBody(req)) as Record<string, unknown>;
  if (typeof body.notificationsEnabled !== "boolean") {
    return json(res, 400, { error: "notificationsEnabled must be a boolean" });
  }

  const updated = setTelegramChatNotificationsEnabled(store, id, body.notificationsEnabled);
  if (!updated) return json(res, 404, { error: "Chat binding not found" });
  const chat = store.getTelegramChatLink(id);
  return json(res, 200, { ok: true, chat });
};

/** DELETE /api/auth/telegram/chats/:telegramChatId */
export const unbindTelegramChatRoute: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const url = new URL(req.url ?? "/", "http://localhost");
  const id = parseTelegramChatId(decodeURIComponent(url.pathname.split("/").pop() ?? ""));
  if (id === null) return json(res, 400, { error: "Invalid Telegram chat id" });

  const unbound = unbindTelegramChat(store, id, admin.email);
  if (!unbound) return json(res, 404, { error: "Chat binding not found" });
  return json(res, 200, { ok: true });
};

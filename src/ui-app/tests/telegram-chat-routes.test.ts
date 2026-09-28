/**
 * Admin Telegram chat bind + per-chat notification opt-out routes (#0535, #0537).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { SESSION_COOKIE_NAME } from "../../core/auth";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import {
  listTelegramChatsRoute,
  patchTelegramChatNotificationsRoute,
} from "../../server/routes/telegram-identity";

function makeReq(
  cookie: string,
  url: string,
  body?: Record<string, unknown>,
  method = "GET",
): IncomingMessage {
  const req = {
    method,
    headers: {
      cookie,
      host: "dev.example.com",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    url,
    socket: { remoteAddress: "127.0.0.1" },
    [Symbol.asyncIterator]: async function* () {
      if (body) yield Buffer.from(JSON.stringify(body), "utf8");
    },
  };
  return req as unknown as IncomingMessage;
}

function makeRes(): { res: ServerResponse; fake: { status: number; payload: unknown } } {
  const fake = { status: 0, payload: undefined as unknown };
  const res = {
    setHeader() {},
    writeHead(code: number) {
      fake.status = code;
    },
    end(p: string) {
      fake.payload = JSON.parse(p);
    },
  };
  return { res: res as unknown as ServerResponse, fake };
}

function makeCtx(root: string): RouteContext {
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    auth: { enabled: true, sessionSecret: "test" },
  };
  return { config } as unknown as RouteContext;
}

describe("telegram chat notification routes", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-tg-chat-routes-"));
    resetAuthStoreInstance();
  });

  afterEach(() => {
    resetAuthStoreInstance();
    rmSync(root, { recursive: true, force: true });
  });

  it("lists bound chats and patches notificationsEnabled", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    const token = store.createSession("admin@example.com", "admin", 3600);
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    bindTelegramChatDirect(store, {
      telegramChatId: 42,
      chatType: "private",
      title: "Ops",
      actorEmail: "admin@example.com",
    });

    const list = makeRes();
    listTelegramChatsRoute(
      makeCtx(root),
      makeReq(cookie, "/api/auth/telegram/chats"),
      list.res,
      {},
    );
    expect(list.fake.status).toBe(200);
    const chats = (list.fake.payload as { chats: { telegramChatId: number }[] }).chats;
    expect(chats.some((c) => c.telegramChatId === 42)).toBe(true);

    const patch = makeRes();
    await patchTelegramChatNotificationsRoute(
      makeCtx(root),
      makeReq(cookie, "/api/auth/telegram/chats/42", { notificationsEnabled: false }, "PATCH"),
      patch.res,
      {},
    );
    expect(patch.fake.status).toBe(200);
    expect(
      (patch.fake.payload as { chat: { notificationsEnabled: boolean } }).chat.notificationsEnabled,
    ).toBe(false);
    expect(store.getTelegramChatLink(42)?.notificationsEnabled).toBe(false);
  });
});

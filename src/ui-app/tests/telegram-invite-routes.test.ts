/**
 * Admin-only Telegram invite / unbind / reassign HTTP routes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import {
  createTelegramInviteRoute,
  listTelegramLinksRoute,
  reassignTelegramLinkRoute,
  unbindTelegramLinkRoute,
} from "../../server/routes/telegram-identity";
import { SESSION_COOKIE_NAME } from "../../core/auth";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";
import {
  createTelegramInvite,
  instanceIdentity,
  redeemTelegramInvite,
  repositoryIdentity,
  TELEGRAM_AUDIT,
} from "../../core/telegram-identity";

function makeReq(cookie: string, url: string, body = "{}"): IncomingMessage {
  const req = {
    headers: { cookie, host: "dev.example.com" },
    url,
    socket: { remoteAddress: "127.0.0.1" },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(body, "utf8");
    },
  };
  return req as unknown as IncomingMessage;
}

interface FakeRes {
  status: number;
  payload: unknown;
}

function makeRes(): { res: ServerResponse; fake: FakeRes } {
  const fake: FakeRes = { status: 0, payload: undefined };
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
    auth: {
      enabled: true,
      sessionSecret: "route-test-session-secret",
    },
  };
  return { config } as unknown as RouteContext;
}

describe("telegram invite routes", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-tg-routes-"));
    resetAuthStoreInstance();
  });

  afterEach(() => {
    resetAuthStoreInstance();
    rmSync(root, { recursive: true, force: true });
  });

  it("lets an admin create an invite for an allowlisted email", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    store.upsertUser("member@example.com", "member", "admin@example.com");
    const token = store.createSession("admin@example.com", "admin", 3600);

    const { res, fake } = makeRes();
    await createTelegramInviteRoute(
      makeCtx(root),
      makeReq(
        `${SESSION_COOKIE_NAME}=${token}`,
        "/api/auth/telegram/invites",
        JSON.stringify({ email: "member@example.com" }),
      ),
      res,
      {},
    );

    expect(fake.status).toBe(200);
    const payload = fake.payload as { startPayload: string; email: string; deepLink: null };
    expect(payload.email).toBe("member@example.com");
    expect(payload.startPayload).toMatch(/^[0-9a-f]{32}$/);
    expect(payload.deepLink).toBeNull();
    expect(store.getAuditLog(5).some((e) => e.action === TELEGRAM_AUDIT.inviteCreated)).toBe(true);
  });

  it("rejects a non-admin caller", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("member@example.com", "member", null);
    const token = store.createSession("member@example.com", "member", 3600);
    const { res, fake } = makeRes();
    await createTelegramInviteRoute(
      makeCtx(root),
      makeReq(
        `${SESSION_COOKIE_NAME}=${token}`,
        "/api/auth/telegram/invites",
        JSON.stringify({ email: "member@example.com" }),
      ),
      res,
      {},
    );
    expect(fake.status).toBe(403);
  });

  it("404s for an email that is not allowlisted", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    const token = store.createSession("admin@example.com", "admin", 3600);
    const { res, fake } = makeRes();
    await createTelegramInviteRoute(
      makeCtx(root),
      makeReq(
        `${SESSION_COOKIE_NAME}=${token}`,
        "/api/auth/telegram/invites",
        JSON.stringify({ email: "nobody@example.com" }),
      ),
      res,
      {},
    );
    expect(fake.status).toBe(404);
  });

  it("lists links and unbinds with an audit event", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    store.upsertUser("member@example.com", "member", "admin@example.com");
    const token = store.createSession("admin@example.com", "admin", 3600);
    const secret = "route-test-session-secret";
    const ctx = {
      secret,
      repoIdentity: repositoryIdentity(root),
      instanceIdentity: instanceIdentity(root),
    };
    const created = createTelegramInvite(store, ctx, {
      email: "member@example.com",
      createdBy: "admin@example.com",
    });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, ctx, {
      nonce: created.nonce,
      telegramUserId: 99,
      telegramUsername: "mem",
    });

    const listed = makeRes();
    listTelegramLinksRoute(
      makeCtx(root),
      makeReq(`${SESSION_COOKIE_NAME}=${token}`, "/api/auth/telegram/links"),
      listed.res,
      {},
    );
    expect(listed.fake.status).toBe(200);
    const links = (listed.fake.payload as { links: Array<{ telegramUserId: number }> }).links;
    expect(links).toHaveLength(1);
    expect(links[0].telegramUserId).toBe(99);

    const unbound = makeRes();
    unbindTelegramLinkRoute(
      makeCtx(root),
      makeReq(`${SESSION_COOKIE_NAME}=${token}`, "/api/auth/telegram/links/99"),
      unbound.res,
      {},
    );
    expect(unbound.fake.status).toBe(200);
    expect(store.getAuditLog(20).some((e) => e.action === TELEGRAM_AUDIT.userUnbound)).toBe(true);
  });

  it("lets an admin reassign an active link and 404s after unbind", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    store.upsertUser("member@example.com", "member", "admin@example.com");
    store.upsertUser("other@example.com", "member", "admin@example.com");
    const token = store.createSession("admin@example.com", "admin", 3600);
    const secret = "route-test-session-secret";
    const ctx = {
      secret,
      repoIdentity: repositoryIdentity(root),
      instanceIdentity: instanceIdentity(root),
    };
    const created = createTelegramInvite(store, ctx, {
      email: "member@example.com",
      createdBy: "admin@example.com",
    });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, ctx, { nonce: created.nonce, telegramUserId: 42 });

    const reassigned = makeRes();
    await reassignTelegramLinkRoute(
      makeCtx(root),
      makeReq(
        `${SESSION_COOKIE_NAME}=${token}`,
        "/api/auth/telegram/links/42/reassign",
        JSON.stringify({ email: "other@example.com" }),
      ),
      reassigned.res,
      {},
    );
    expect(reassigned.fake.status).toBe(200);
    expect(reassigned.fake.payload).toEqual({ ok: true, email: "other@example.com" });
    expect(store.getAuditLog(20).some((e) => e.action === TELEGRAM_AUDIT.userReassigned)).toBe(
      true,
    );

    const unbound = makeRes();
    unbindTelegramLinkRoute(
      makeCtx(root),
      makeReq(`${SESSION_COOKIE_NAME}=${token}`, "/api/auth/telegram/links/42"),
      unbound.res,
      {},
    );
    expect(unbound.fake.status).toBe(200);

    const afterUnbind = makeRes();
    await reassignTelegramLinkRoute(
      makeCtx(root),
      makeReq(
        `${SESSION_COOKIE_NAME}=${token}`,
        "/api/auth/telegram/links/42/reassign",
        JSON.stringify({ email: "member@example.com" }),
      ),
      afterUnbind.res,
      {},
    );
    expect(afterUnbind.fake.status).toBe(404);
    expect(store.getTelegramLink(42)?.email).toBe("other@example.com");
    expect(store.getTelegramLink(42)?.revokedAt).not.toBeNull();
  });
});

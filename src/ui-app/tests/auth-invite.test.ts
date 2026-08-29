/**
 * (Re)send an invite email — admin-only, callable any time (not just once
 * at add-time), used both by the "Invite" button next to each user and the
 * "send an invite now?" prompt right after adding someone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { sendInvite } from "../../server/routes/auth";
import { SESSION_COOKIE_NAME } from "../../core/auth";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";

function makeReq(cookie: string): IncomingMessage {
  const req = {
    headers: { cookie, host: "dev.example.com", "x-forwarded-proto": "https" },
    url: "/api/auth/users/member@example.com/invite",
    socket: { remoteAddress: "127.0.0.1" },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from("{}", "utf8");
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
      emailProvider: { type: "resend", apiKey: "key", fromAddress: "otp@send.x.com" },
    },
  };
  return { config } as unknown as RouteContext;
}

describe("sendInvite route", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-invite-"));
    resetAuthStoreInstance();
  });

  afterEach(() => {
    resetAuthStoreInstance();
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("sends an invite and logs it in the audit log", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    store.upsertUser("member@example.com", "member", "admin@example.com");
    const token = store.createSession("admin@example.com", "admin", 3600);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "" })),
    );

    const ctx = makeCtx(root);
    const { res, fake } = makeRes();
    await sendInvite(ctx, makeReq(`${SESSION_COOKIE_NAME}=${token}`), res, {});

    expect(fake.status).toBe(200);
    expect(fake.payload).toEqual({ ok: true });

    const entries = store.getAuditLog(10);
    expect(
      entries.some((e) => e.action === "invite_sent" && e.targetEmail === "member@example.com"),
    ).toBe(true);
  });

  it("rejects a non-admin caller", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("member@example.com", "member", null);
    const token = store.createSession("member@example.com", "member", 3600);

    const ctx = makeCtx(root);
    const { res, fake } = makeRes();
    await sendInvite(ctx, makeReq(`${SESSION_COOKIE_NAME}=${token}`), res, {});

    expect(fake.status).toBe(403);
  });

  it("404s for an email that isn't on the allowlist", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    const token = store.createSession("admin@example.com", "admin", 3600);

    const ctx = makeCtx(root);
    const { res, fake } = makeRes();
    await sendInvite(ctx, makeReq(`${SESSION_COOKIE_NAME}=${token}`), res, {});

    expect(fake.status).toBe(404);
  });

  it("502s and does not log anything when the send fails", async () => {
    const store = getAuthStore(root)!;
    store.upsertUser("admin@example.com", "admin", null);
    store.upsertUser("member@example.com", "member", "admin@example.com");
    const token = store.createSession("admin@example.com", "admin", 3600);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, text: async () => "domain not verified" })),
    );

    const ctx = makeCtx(root);
    const { res, fake } = makeRes();
    await sendInvite(ctx, makeReq(`${SESSION_COOKIE_NAME}=${token}`), res, {});

    expect(fake.status).toBe(502);
    const entries = store.getAuditLog(10);
    expect(entries.some((e) => e.action === "invite_sent")).toBe(false);
  });
});

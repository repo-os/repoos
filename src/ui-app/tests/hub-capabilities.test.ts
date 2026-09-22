import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { AuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import {
  createHubCapabilityToken,
  HUB_CAPABILITY_AUDIENCE,
  HUB_CAPABILITY_SCOPE_SUMMARY,
  HUB_CAPABILITY_VERSION,
} from "../../core/hub-capabilities.js";
import {
  createHubCapability,
  hubSummary,
  hubTaskSearch,
  listHubCapabilities,
} from "../../server/routes/hub.js";
import type { RouteContext } from "../../server/routes/types.js";

let root: string;
let store: AuthStore;

function request(
  headers: Record<string, string>,
  body?: unknown,
  remoteAddress = "127.0.0.1",
): IncomingMessage {
  const { url, ...rest } = headers;
  const bytes = Buffer.from(body === undefined ? "" : JSON.stringify(body));
  return {
    headers: rest,
    url: url ?? "/",
    socket: { remoteAddress },
    [Symbol.asyncIterator]: async function* () {
      if (bytes.length) yield bytes;
    },
  } as unknown as IncomingMessage;
}

function response(): { res: ServerResponse; result: { status: number; body: any } } {
  const result = { status: 0, body: undefined as any };
  return {
    result,
    res: {
      writeHead(status: number) {
        result.status = status;
      },
      end(payload: string) {
        result.body = JSON.parse(payload);
      },
    } as unknown as ServerResponse,
  };
}

function context(tasks: Task[]): RouteContext {
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    auth: { enabled: true },
  };
  return {
    config,
    index: { getTasks: () => tasks } as unknown as RouteContext["index"],
    indexReady: Promise.resolve(),
    runner: {
      running: () => [{ id: "1", pid: 1, startedAt: "2026-09-21T00:00:00.000Z" }],
    } as unknown as RouteContext["runner"],
  } as unknown as RouteContext;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repoos-hub-capability-"));
  mkdirSync(join(root, ".repoos"), { recursive: true });
  resetAuthStoreInstance();
  store = new AuthStore(root);
  store.upsertUser("alice@example.com", "admin", null);
});

afterEach(() => {
  store.close();
  resetAuthStoreInstance();
  rmSync(root, { recursive: true, force: true });
});

describe("Hub capability contract", () => {
  it("allows bounded Hub reads without a token only from a loopback socket", async () => {
    const ctx = context([{ status: "review", needsInput: false } as Task]);
    const local = response();
    await hubSummary(ctx, request({ host: "localhost:7171" }), local.res, {});
    expect(local.result.status).toBe(200);
    expect(local.result.body.attention.reviewReadyTasks).toBe(1);

    const remoteRequest = request({ host: "repoos.example.test" }, undefined, "203.0.113.12");
    const remote = response();
    await hubSummary(ctx, remoteRequest, remote.res, {});
    expect(remote.result.status).toBe(401);
  });

  it("issues one-time metadata plus a bearer token, then serves only the compact summary", async () => {
    const session = store.createSession("alice@example.com", "admin", 3600);
    const ctx = context([
      { status: "review", needsInput: false, updated_at: "2026-09-21T00:01:00.000Z" } as Task,
      { status: "active", needsInput: true, updated_at: "2026-09-21T00:02:00.000Z" } as Task,
    ]);
    const created = response();
    await createHubCapability(
      ctx,
      request(
        {
          cookie: `repoos_session=${session}`,
          host: "repoos.example.test",
          "x-forwarded-proto": "https",
        },
        { label: "Mac Hub" },
      ),
      created.res,
      {},
    );

    expect(created.result.status).toBe(201);
    expect(created.result.body.token).toMatch(/^roh_[0-9a-f]{64}$/);
    expect(created.result.body.capability.tokenHash).toBeUndefined();

    const summary = response();
    await hubSummary(
      ctx,
      request({
        authorization: `Bearer ${created.result.body.token}`,
        host: "repoos.example.test",
        "x-forwarded-proto": "https",
      }),
      summary.res,
      {},
    );
    expect(summary.result.status).toBe(200);
    expect(summary.result.body).toEqual({
      apiVersion: "v1",
      generatedAt: expect.any(String),
      lastActivityAt: "2026-09-21T00:02:00.000Z",
      attention: { activeAgents: 1, reviewReadyTasks: 1, needsInputTasks: 1 },
    });
  });

  it("does not return token material and revocation takes effect immediately", async () => {
    const session = store.createSession("alice@example.com", "admin", 3600);
    const ctx = context([]);
    const created = response();
    await createHubCapability(
      ctx,
      request(
        {
          cookie: `repoos_session=${session}`,
          host: "repoos.example.test",
          "x-forwarded-proto": "https",
        },
        { label: "Mac Hub" },
      ),
      created.res,
      {},
    );
    const token = created.result.body.token as string;
    const listed = response();
    await listHubCapabilities(
      ctx,
      request({ cookie: `repoos_session=${session}` }),
      listed.res,
      {},
    );
    expect(listed.result.body.capabilities[0].token).toBeUndefined();
    expect(listed.result.body.capabilities[0].tokenHash).toBeUndefined();

    const capabilityId = listed.result.body.capabilities[0].id;
    expect(store.revokeHubCapability(capabilityId)).toBe(true);
    const denied = response();
    await hubSummary(
      ctx,
      request({
        authorization: `Bearer ${token}`,
        host: "repoos.example.test",
        "x-forwarded-proto": "https",
      }),
      denied.res,
      {},
    );
    expect(denied.result.status).toBe(401);
  });

  it("serves bounded task search only when the capability includes search:read", async () => {
    const session = store.createSession("alice@example.com", "admin", 3600);
    const ctx = context([
      {
        id: "0476",
        title: "Cross-server palette search",
        status: "active",
        updated_at: "2026-09-22T00:00:00.000Z",
      } as Task,
    ]);
    const created = response();
    await createHubCapability(
      ctx,
      request(
        {
          cookie: `repoos_session=${session}`,
          host: "repoos.example.test",
          "x-forwarded-proto": "https",
        },
        { label: "Mac Hub" },
      ),
      created.res,
      {},
    );
    const token = created.result.body.token as string;

    const search = response();
    await hubTaskSearch(
      ctx,
      request({
        authorization: `Bearer ${token}`,
        host: "repoos.example.test",
        "x-forwarded-proto": "https",
        url: "/api/hub/v1/tasks/search?q=palette",
      }),
      search.res,
      {},
    );
    expect(search.result.status).toBe(200);
    expect(search.result.body.results).toEqual([
      {
        id: "0476",
        title: "Cross-server palette search",
        status: "active",
        updatedAt: "2026-09-22T00:00:00.000Z",
        routePath: "/work?task=0476",
      },
    ]);
    expect(search.result.body.results[0]).not.toHaveProperty("body");

    const legacyIssued = createHubCapabilityToken();
    const now = new Date();
    store.createHubCapability({
      id: "hub_legacysummary",
      label: "Legacy summary only",
      ownerEmail: "alice@example.com",
      tokenHash: legacyIssued.tokenHash,
      origin: "https://repoos.example.test",
      audience: HUB_CAPABILITY_AUDIENCE,
      scope: HUB_CAPABILITY_SCOPE_SUMMARY,
      version: HUB_CAPABILITY_VERSION,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    });
    const deniedSearch = response();
    await hubTaskSearch(
      ctx,
      request({
        authorization: `Bearer ${legacyIssued.token}`,
        host: "repoos.example.test",
        "x-forwarded-proto": "https",
        url: "/api/hub/v1/tasks/search?q=palette",
      }),
      deniedSearch.res,
      {},
    );
    expect(deniedSearch.result.status).toBe(401);
  });
});

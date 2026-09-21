import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { AuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { createHubCapability, hubSummary, listHubCapabilities } from "../../server/routes/hub.js";
import type { RouteContext } from "../../server/routes/types.js";

let root: string;
let store: AuthStore;

function request(headers: Record<string, string>, body?: unknown): IncomingMessage {
  const bytes = Buffer.from(body === undefined ? "" : JSON.stringify(body));
  return {
    headers,
    socket: { remoteAddress: "127.0.0.1" },
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
});

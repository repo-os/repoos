import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";
import { SESSION_COOKIE_NAME } from "../../core/auth";
import {
  createProjectEnvironment,
  listProjectEnvironments,
  listProjectEnvironmentSecrets,
  mutateProjectEnvironmentSecret,
} from "../../server/routes/project-environments";

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-secret-route-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(join(root, ".gitignore"), ".env.dev\n");
  mkdirSync(join(root, ".repoos"));
  writeFileSync(
    join(root, ".repoos/environments.json"),
    JSON.stringify({
      environments: [{ id: "dev", sources: [{ id: "local", path: ".env.dev" }] }],
    }),
  );
  writeFileSync(join(root, ".env.dev"), "TOKEN=initial\n");
  const auth = getAuthStore(root)!;
  auth.upsertUser("admin@example.test", "admin", null);
  auth.upsertUser("member@example.test", "member", null);
  const adminToken = auth.createSession("admin@example.test", "admin", 3600);
  const memberToken = auth.createSession("member@example.test", "member", 3600);
  const config = { root, auth: { enabled: true } };
  const ctx = { config } as never;
  const response = () => {
    let status = 0;
    let payload: unknown;
    let raw = "";
    return {
      fake: {
        get status() {
          return status;
        },
        get payload() {
          return payload;
        },
        get raw() {
          return raw;
        },
      },
      res: {
        setHeader() {},
        writeHead(code: number) {
          status = code;
        },
        end(value: string) {
          raw = value;
          payload = JSON.parse(value);
        },
      } as unknown as ServerResponse,
    };
  };
  const req = (body = "{}", opts?: { token?: string; host?: string; origin?: string }) =>
    ({
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${opts?.token ?? adminToken}`,
        host: opts?.host ?? "localhost",
        ...(opts?.origin ? { origin: opts.origin } : {}),
      },
      socket: {},
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(body);
      },
    }) as unknown as IncomingMessage;
  return { root, auth, ctx, response, req, memberToken };
}

describe("project environment secret routes", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
    resetAuthStoreInstance();
  });

  it("mutates values without returning, logging, or auditing them and rejects stale edits", async () => {
    const fx = makeFixture();
    root = fx.root;
    const first = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), first.res, { param1: "dev" });
    const listing = first.fake.payload as { version: string };
    const sentinel = "FAKE_SENTINEL_0928_NEVER_ECHO";
    const put = fx.response();
    await mutateProjectEnvironmentSecret(
      fx.ctx,
      fx.req(
        JSON.stringify({
          action: "replace",
          key: "TOKEN",
          value: sentinel,
          version: listing.version,
        }),
      ),
      put.res,
      { param1: "dev" },
    );
    expect(put.fake.status).toBe(200);
    const auditText = readFileSync(join(root, ".repoos", "secret-audit.ndjson"), "utf8");
    const secretFree =
      JSON.stringify(put.fake.payload) + JSON.stringify(fx.auth.getAuditLog(20)) + auditText;
    expect(secretFree).not.toContain(sentinel);
    expect(auditText).toContain('"action":"replace"');
    expect(auditText).toContain('"key":"TOKEN"');
    const stale = fx.response();
    await mutateProjectEnvironmentSecret(
      fx.ctx,
      fx.req(
        JSON.stringify({
          action: "replace",
          key: "TOKEN",
          value: "another",
          version: listing.version,
        }),
      ),
      stale.res,
      { param1: "dev" },
    );
    expect(stale.fake.status).toBe(409);
    const reread = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), reread.res, { param1: "dev" });
    expect(JSON.stringify(reread.fake.payload)).not.toContain(sentinel);
  });

  it("lists environment metadata and creates an empty ignored source without values", async () => {
    const fx = makeFixture();
    root = fx.root;
    writeFileSync(join(root, ".gitignore"), ".env.dev\n.env.integration\n");
    const list = fx.response();
    listProjectEnvironments(fx.ctx, fx.req(), list.res, {});
    expect(list.fake.status).toBe(200);
    expect(JSON.stringify(list.fake.payload)).not.toContain("initial");
    expect(JSON.stringify(list.fake.payload)).toContain("dev");

    const created = fx.response();
    await createProjectEnvironment(
      fx.ctx,
      fx.req(JSON.stringify({ name: "integration" })),
      created.res,
      {},
    );
    expect(created.fake.status).toBe(201);
    expect(JSON.stringify(created.fake.payload)).not.toContain("initial");
    expect(readFileSync(join(root, ".env.integration"), "utf8")).toBe("");
    const reread = fx.response();
    listProjectEnvironments(fx.ctx, fx.req(), reread.res, {});
    expect(JSON.stringify(reread.fake.payload)).toContain("integration");
  });

  it("rejects non-admin callers, mismatched origins, and reserved RepoOS keys", async () => {
    const fx = makeFixture();
    root = fx.root;
    const denied = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req("{}", { token: fx.memberToken }), denied.res, {
      param1: "dev",
    });
    expect(denied.fake.status).toBe(403);

    const origin = fx.response();
    listProjectEnvironmentSecrets(
      fx.ctx,
      fx.req("{}", { origin: "http://evil.example" }),
      origin.res,
      { param1: "dev" },
    );
    expect(origin.fake.status).toBe(403);
    expect(origin.fake.raw).not.toContain("initial");

    const list = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), list.res, { param1: "dev" });
    const listing = list.fake.payload as { version: string };
    const reserved = fx.response();
    await mutateProjectEnvironmentSecret(
      fx.ctx,
      fx.req(
        JSON.stringify({
          action: "add",
          key: "OPENAI_API_KEY",
          value: "FAKE_SENTINEL_0928_RESERVED",
          version: listing.version,
        }),
      ),
      reserved.res,
      { param1: "dev" },
    );
    expect(reserved.fake.status).toBe(400);
    expect(reserved.fake.raw).not.toContain("FAKE_SENTINEL_0928_RESERVED");
  });

  it("supports add and delete metadata mutations without revealing values", async () => {
    const fx = makeFixture();
    root = fx.root;
    const list = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), list.res, { param1: "dev" });
    const listing = list.fake.payload as { version: string };

    const sentinel = "FAKE_SENTINEL_0928_ADD_FLOW";
    const add = fx.response();
    await mutateProjectEnvironmentSecret(
      fx.ctx,
      fx.req(
        JSON.stringify({
          action: "add",
          key: "NEW_KEY",
          value: sentinel,
          version: listing.version,
        }),
      ),
      add.res,
      { param1: "dev" },
    );
    expect(add.fake.status).toBe(200);
    expect(JSON.stringify(add.fake.payload)).not.toContain(sentinel);

    const relist = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), relist.res, { param1: "dev" });
    const afterAdd = relist.fake.payload as {
      version: string;
      keys: Array<{ name: string; status: string }>;
    };
    expect(afterAdd.keys.find((row) => row.name === "NEW_KEY")).toMatchObject({ status: "set" });

    const del = fx.response();
    await mutateProjectEnvironmentSecret(
      fx.ctx,
      fx.req(
        JSON.stringify({
          action: "delete",
          key: "NEW_KEY",
          version: afterAdd.version,
        }),
      ),
      del.res,
      { param1: "dev" },
    );
    expect(del.fake.status).toBe(200);
    expect(JSON.stringify(del.fake.payload)).not.toContain(sentinel);

    const finalList = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), finalList.res, { param1: "dev" });
    const afterDelete = finalList.fake.payload as {
      keys: Array<{ name: string; status: string }>;
    };
    expect(afterDelete.keys.find((row) => row.name === "NEW_KEY" && row.status === "set")).toBe(
      undefined,
    );
  });

  it("rejects delete on inherited-only keys and reports accurate status after writable delete", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-secret-route-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, ".gitignore"), ".env.base\n.env.dev\n");
    mkdirSync(join(root, ".repoos"));
    writeFileSync(
      join(root, ".repoos/environments.json"),
      JSON.stringify({
        environments: [
          {
            id: "dev",
            sources: [
              { id: "base", path: ".env.base" },
              { id: "local", path: ".env.dev" },
            ],
          },
        ],
      }),
    );
    writeFileSync(join(root, ".env.base"), "INHERITED=from-base\n");
    writeFileSync(join(root, ".env.dev"), "\n");
    const auth = getAuthStore(root)!;
    auth.upsertUser("admin@example.test", "admin", null);
    const token = auth.createSession("admin@example.test", "admin", 3600);
    const ctx = { config: { root, auth: { enabled: true } } } as never;
    const response = () => {
      let status = 0;
      let payload: unknown;
      return {
        fake: {
          get status() {
            return status;
          },
          get payload() {
            return payload;
          },
        },
        res: {
          setHeader() {},
          writeHead(code: number) {
            status = code;
          },
          end(value: string) {
            payload = JSON.parse(value);
          },
        } as unknown as ServerResponse,
      };
    };
    const req = (body = "{}", origin?: string) =>
      ({
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          host: "localhost",
          ...(origin ? { origin } : {}),
        },
        socket: {},
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(body);
        },
      }) as unknown as IncomingMessage;

    const list = response();
    listProjectEnvironmentSecrets(ctx, req(), list.res, { param1: "dev" });
    const listing = list.fake.payload as { version: string };

    const inheritedDelete = response();
    await mutateProjectEnvironmentSecret(
      ctx,
      req(
        JSON.stringify({
          action: "delete",
          key: "INHERITED",
          version: listing.version,
        }),
      ),
      inheritedDelete.res,
      { param1: "dev" },
    );
    expect(inheritedDelete.fake.status).toBe(409);

    const override = response();
    await mutateProjectEnvironmentSecret(
      ctx,
      req(
        JSON.stringify({
          action: "replace",
          key: "INHERITED",
          value: "FAKE_SENTINEL_0928_OVERRIDE",
          version: listing.version,
        }),
      ),
      override.res,
      { param1: "dev" },
    );
    expect(override.fake.status).toBe(200);
    expect(JSON.stringify(override.fake.payload)).not.toContain("FAKE_SENTINEL_0928_OVERRIDE");

    const relist = response();
    listProjectEnvironmentSecrets(ctx, req(), relist.res, { param1: "dev" });
    const afterOverride = relist.fake.payload as { version: string };

    const writableDelete = response();
    await mutateProjectEnvironmentSecret(
      ctx,
      req(
        JSON.stringify({
          action: "delete",
          key: "INHERITED",
          version: afterOverride.version,
        }),
      ),
      writableDelete.res,
      { param1: "dev" },
    );
    expect(writableDelete.fake.status).toBe(200);
    expect(writableDelete.fake.payload).toMatchObject({ status: "set" });

    const mutateOrigin = response();
    await mutateProjectEnvironmentSecret(
      ctx,
      req(
        JSON.stringify({
          action: "replace",
          key: "INHERITED",
          value: "x",
          version: afterOverride.version,
        }),
        "http://evil.example",
      ),
      mutateOrigin.res,
      { param1: "dev" },
    );
    expect(mutateOrigin.fake.status).toBe(403);
  });
});

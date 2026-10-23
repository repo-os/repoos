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
  getProjectEnvironmentBindings,
  putProjectEnvironmentBinding,
  RESERVED_PROJECT_ENVIRONMENT_KEYS,
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
    const headers: Record<string, string> = {};
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
        get headers() {
          return headers;
        },
      },
      res: {
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = value;
        },
        writeHead(code: number, responseHeaders?: Record<string, string>) {
          status = code;
          for (const [name, value] of Object.entries(responseHeaders ?? {}))
            headers[name.toLowerCase()] = value;
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

  it.each([
    [
      "environment list",
      (fx: ReturnType<typeof makeFixture>, res: ServerResponse) =>
        listProjectEnvironments(fx.ctx, fx.req("{}", { token: "invalid-session" }), res, {}),
    ],
    [
      "secret metadata",
      (fx: ReturnType<typeof makeFixture>, res: ServerResponse) =>
        listProjectEnvironmentSecrets(fx.ctx, fx.req("{}", { token: "invalid-session" }), res, {
          param1: "dev",
        }),
    ],
    [
      "binding metadata",
      (fx: ReturnType<typeof makeFixture>, res: ServerResponse) =>
        getProjectEnvironmentBindings(fx.ctx, fx.req("{}", { token: "invalid-session" }), res, {}),
    ],
  ])("rejects unauthenticated %s reads without returning metadata", (_name, route) => {
    const fx = makeFixture();
    root = fx.root;
    const response = fx.response();
    route(fx, response.res);
    expect(response.fake.status).toBe(401);
    expect(response.fake.raw).toBe(JSON.stringify({ error: "Authentication required" }));
    expect(response.fake.raw).not.toContain("TOKEN");
    expect(response.fake.raw).not.toContain("dev");
  });

  it("keeps the documented reserved project keys in sync with the route guard", () => {
    const doc = readFileSync(
      join(__dirname, "../../../user-docs/environment-and-secrets.md"),
      "utf8",
    );
    const section = doc.match(
      /<!-- reserved-project-keys:start -->([\s\S]*?)<!-- reserved-project-keys:end -->/,
    );
    expect(section, "reserved project key documentation block").not.toBeNull();
    const documented = section![1]
      .split("\n")
      .map((line) => line.match(/^`([A-Z0-9_]+)`$/)?.[1])
      .filter((name): name is string => !!name);
    expect(documented).toEqual(RESERVED_PROJECT_ENVIRONMENT_KEYS);
  });

  it("mutates values without returning, logging, or auditing them and rejects stale edits", async () => {
    const fx = makeFixture();
    root = fx.root;
    mkdirSync(join(root, "work"));
    writeFileSync(join(root, "work/task.md"), "Task body without secret values.\n");
    writeFileSync(join(root, "repoos.toml"), 'defaultAssignee = "ai"\n');
    const first = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), first.res, { param1: "dev" });
    expect(first.fake.headers["cache-control"]).toBe("no-store");
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
    expect(put.fake.headers["cache-control"]).toBe("no-store");
    const auditText = readFileSync(join(root, ".repoos", "secret-audit.ndjson"), "utf8");
    const secretFree =
      JSON.stringify(put.fake.payload) + JSON.stringify(fx.auth.getAuditLog(20)) + auditText;
    expect(secretFree).not.toContain(sentinel);
    expect(readFileSync(join(root, "work/task.md"), "utf8")).not.toContain(sentinel);
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).not.toContain(sentinel);
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
    expect(stale.fake.headers["cache-control"]).toBe("no-store");
    const reread = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), reread.res, { param1: "dev" });
    expect(JSON.stringify(reread.fake.payload)).not.toContain(sentinel);
    expect(reread.fake.headers["cache-control"]).toBe("no-store");
  });

  it("lists environment metadata and creates an empty ignored source without values", async () => {
    const fx = makeFixture();
    root = fx.root;
    writeFileSync(join(root, ".gitignore"), ".env.dev\n.env.integration\n");
    const list = fx.response();
    listProjectEnvironments(fx.ctx, fx.req(), list.res, {});
    expect(list.fake.status).toBe(200);
    expect(list.fake.headers["cache-control"]).toBe("no-store");
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

  it("reports public visibility prefixes without returning file values", () => {
    const fx = makeFixture();
    root = fx.root;
    const sentinel = "FAKE_SENTINEL_0932_PUBLIC_VALUE";
    writeFileSync(
      join(root, ".env.dev"),
      `PUBLIC_CLIENT_TOKEN=${sentinel}\nSERVER_TOKEN=server-fake\n`,
    );
    const response = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), response.res, { param1: "dev" });
    expect(response.fake.headers["cache-control"]).toBe("no-store");
    expect(response.fake.raw).not.toContain(sentinel);
    expect(response.fake.payload).toMatchObject({
      keys: [
        { name: "PUBLIC_CLIENT_TOKEN", visibility: "public", status: "set" },
        { name: "SERVER_TOKEN", visibility: "server-only", status: "set" },
      ],
    });
  });

  it("reports example key names without returning tracked placeholder values", () => {
    const fx = makeFixture();
    root = fx.root;
    const sentinel = "FAKE_SENTINEL_0932_EXAMPLE_PLACEHOLDER";
    writeFileSync(join(root, ".env.example"), `EXAMPLE_TOKEN=${sentinel}\n`);
    execFileSync("git", ["add", ".env.example"], { cwd: root });
    writeFileSync(
      join(root, ".repoos/environments.json"),
      JSON.stringify({
        environments: [
          { id: "dev", sources: [{ id: "local", path: ".env.dev", examplePath: ".env.example" }] },
        ],
      }),
    );
    const response = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), response.res, { param1: "dev" });
    expect(response.fake.status).toBe(200);
    expect(response.fake.raw).not.toContain(sentinel);
    expect(
      (response.fake.payload as { keys: Array<{ name: string; status: string }> }).keys,
    ).toContainEqual(expect.objectContaining({ name: "EXAMPLE_TOKEN", status: "missing" }));
  });

  it("refuses tracked sources through the real route without echoing the submitted value", async () => {
    const fx = makeFixture();
    root = fx.root;
    const sentinel = "FAKE_SENTINEL_0932_TRACKED_WRITE";
    writeFileSync(join(root, "tracked.env"), "TOKEN=old\n");
    execFileSync("git", ["add", "tracked.env"], { cwd: root });
    writeFileSync(
      join(root, ".repoos/environments.json"),
      JSON.stringify({
        environments: [{ id: "dev", sources: [{ id: "local", path: "tracked.env" }] }],
      }),
    );
    const list = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req(), list.res, { param1: "dev" });
    const { version } = list.fake.payload as { version: string };
    const write = fx.response();
    await mutateProjectEnvironmentSecret(
      fx.ctx,
      fx.req(JSON.stringify({ action: "replace", key: "TOKEN", value: sentinel, version })),
      write.res,
      { param1: "dev" },
    );
    expect(write.fake.status).toBe(400);
    expect(write.fake.raw).not.toContain(sentinel);
    expect(readFileSync(join(root, "tracked.env"), "utf8")).toBe("TOKEN=old\n");
  });

  it.each(["REPOOS_TOKEN", "PATH", "HOME", "NODE_OPTIONS", "PORT", "HOST"])(
    "rejects reserved project key %s on the real mutation route",
    async (key) => {
      const fx = makeFixture();
      root = fx.root;
      const list = fx.response();
      listProjectEnvironmentSecrets(fx.ctx, fx.req(), list.res, { param1: "dev" });
      const metadata = list.fake.payload as { version: string };
      const write = fx.response();
      await mutateProjectEnvironmentSecret(
        fx.ctx,
        fx.req(
          JSON.stringify({
            action: "add",
            key,
            value: `FAKE_SENTINEL_${key}`,
            version: metadata.version,
          }),
        ),
        write.res,
        { param1: "dev" },
      );
      expect(write.fake.status).toBe(400);
      expect(write.fake.raw).not.toContain(`FAKE_SENTINEL_${key}`);
    },
  );

  it("allows member metadata reads, rejects member writes and mismatched origins", async () => {
    const fx = makeFixture();
    root = fx.root;
    const denied = fx.response();
    listProjectEnvironmentSecrets(fx.ctx, fx.req("{}", { token: fx.memberToken }), denied.res, {
      param1: "dev",
    });
    expect(denied.fake.status).toBe(200);
    expect(denied.fake.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(denied.fake.payload)).not.toContain("initial");

    const memberEnvironments = fx.response();
    listProjectEnvironments(
      fx.ctx,
      fx.req("{}", { token: fx.memberToken }),
      memberEnvironments.res,
      {},
    );
    expect(memberEnvironments.fake.status).toBe(200);
    const memberBindings = fx.response();
    getProjectEnvironmentBindings(
      fx.ctx,
      fx.req("{}", { token: fx.memberToken }),
      memberBindings.res,
      {},
    );
    expect(memberBindings.fake.status).toBe(200);

    const memberWrite = fx.response();
    await createProjectEnvironment(
      fx.ctx,
      fx.req(JSON.stringify({ name: "member-env" }), { token: fx.memberToken }),
      memberWrite.res,
      {},
    );
    expect(memberWrite.fake.status).toBe(403);

    const memberSecretWrite = fx.response();
    await mutateProjectEnvironmentSecret(
      fx.ctx,
      fx.req(
        JSON.stringify({ action: "replace", key: "TOKEN", value: "member-fake", version: "x" }),
        {
          token: fx.memberToken,
        },
      ),
      memberSecretWrite.res,
      { param1: "dev" },
    );
    expect(memberSecretWrite.fake.status).toBe(403);

    const origin = fx.response();
    listProjectEnvironmentSecrets(
      fx.ctx,
      fx.req("{}", { origin: "http://evil.example" }),
      origin.res,
      { param1: "dev" },
    );
    expect(origin.fake.status).toBe(403);
    expect(origin.fake.raw).not.toContain("initial");

    const createOrigin = fx.response();
    await createProjectEnvironment(
      fx.ctx,
      fx.req(JSON.stringify({ name: "integration" }), { origin: "http://evil.example" }),
      createOrigin.res,
      {},
    );
    expect(createOrigin.fake.status).toBe(403);

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

  it("allows an authorized caller to clear a deployment binding", async () => {
    const fx = makeFixture();
    root = fx.root;
    const bind = fx.response();
    await putProjectEnvironmentBinding(
      fx.ctx,
      fx.req(
        JSON.stringify({ consumer: "deployment:Dashboard prod", environment: "dev", keys: [] }),
      ),
      bind.res,
      {},
    );
    expect(bind.fake.status).toBe(200);

    const clear = fx.response();
    await putProjectEnvironmentBinding(
      fx.ctx,
      fx.req(
        JSON.stringify({ consumer: "deployment:Dashboard prod", environment: null, keys: [] }),
      ),
      clear.res,
      {},
    );
    expect(clear.fake.status).toBe(200);
    const listed = fx.response();
    getProjectEnvironmentBindings(fx.ctx, fx.req(), listed.res, {});
    expect(listed.fake.payload).toEqual({ bindings: [] });
  });

  it("requires an admin to change a deployment environment binding", async () => {
    const fx = makeFixture();
    root = fx.root;
    const response = fx.response();
    await putProjectEnvironmentBinding(
      fx.ctx,
      fx.req(
        JSON.stringify({ consumer: "deployment:Dashboard prod", environment: "dev", keys: [] }),
        { token: fx.auth.createSession("member@example.test", "member", 3600) },
      ),
      response.res,
      {},
    );
    expect(response.fake.status).toBe(403);
    const listed = fx.response();
    getProjectEnvironmentBindings(fx.ctx, fx.req(), listed.res, {});
    expect(listed.fake.payload).toEqual({ bindings: [] });

    const environmentList = fx.response();
    listProjectEnvironments(
      fx.ctx,
      fx.req("{}", { token: fx.memberToken }),
      environmentList.res,
      {},
    );
    expect(environmentList.fake.status).toBe(200);

    const originDenied = fx.response();
    await putProjectEnvironmentBinding(
      fx.ctx,
      fx.req(JSON.stringify({ consumer: "deployment:test", environment: "dev", keys: [] }), {
        origin: "http://evil.example",
      }),
      originDenied.res,
      {},
    );
    expect(originDenied.fake.status).toBe(403);
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

    const inheritedReplace = response();
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
      inheritedReplace.res,
      { param1: "dev" },
    );
    expect(inheritedReplace.fake.status).toBe(409);
    expect(JSON.stringify(inheritedReplace.fake.payload)).not.toContain(
      "FAKE_SENTINEL_0928_OVERRIDE",
    );
    expect(readFileSync(join(root, ".env.dev"), "utf8")).not.toContain("INHERITED=");

    const localAdd = response();
    await mutateProjectEnvironmentSecret(
      ctx,
      req(
        JSON.stringify({
          action: "add",
          key: "LOCAL",
          value: "local-fake",
          version: listing.version,
        }),
      ),
      localAdd.res,
      { param1: "dev" },
    );
    expect(localAdd.fake.status).toBe(200);
    const relist = response();
    listProjectEnvironmentSecrets(ctx, req(), relist.res, { param1: "dev" });
    const afterLocalAdd = relist.fake.payload as { version: string };

    const writableDelete = response();
    await mutateProjectEnvironmentSecret(
      ctx,
      req(
        JSON.stringify({
          action: "delete",
          key: "LOCAL",
          version: afterLocalAdd.version,
        }),
      ),
      writableDelete.res,
      { param1: "dev" },
    );
    expect(writableDelete.fake.status).toBe(200);
    expect(writableDelete.fake.payload).toMatchObject({ status: "missing" });

    const mutateOrigin = response();
    await mutateProjectEnvironmentSecret(
      ctx,
      req(
        JSON.stringify({
          action: "replace",
          key: "LOCAL",
          value: "x",
          version: afterLocalAdd.version,
        }),
        "http://evil.example",
      ),
      mutateOrigin.res,
      { param1: "dev" },
    );
    expect(mutateOrigin.fake.status).toBe(403);
  });
});

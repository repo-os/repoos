import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";
import { SESSION_COOKIE_NAME } from "../../core/auth";
import { listProjectEnvironmentSecrets, mutateProjectEnvironmentSecret } from "../../server/routes/project-environments";

describe("project environment secret routes", () => {
  let root = "";
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = ""; resetAuthStoreInstance(); });

  it("mutates values without returning, logging, or auditing them and rejects stale edits", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-secret-route-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, ".gitignore"), ".env.dev\n");
    mkdirSync(join(root, ".repoos"));
    writeFileSync(join(root, ".repoos/environments.json"), JSON.stringify({ environments: [{ id: "dev", sources: [{ id: "local", path: ".env.dev" }] }] }));
    writeFileSync(join(root, ".env.dev"), "TOKEN=initial\n");
    const auth = getAuthStore(root)!;
    auth.upsertUser("admin@example.test", "admin", null);
    const token = auth.createSession("admin@example.test", "admin", 3600);
    const config = { root, auth: { enabled: true } };
    const ctx = { config } as never;
    const response = () => {
      let status = 0; let payload: unknown;
      return { fake: { get status() { return status; }, get payload() { return payload; } }, res: {
        setHeader() {}, writeHead(code: number) { status = code; }, end(value: string) { payload = JSON.parse(value); },
      } as unknown as ServerResponse };
    };
    const req = (body = "{}") => ({ headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, host: "localhost" }, socket: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(body); } }) as unknown as IncomingMessage;
    const first = response();
    listProjectEnvironmentSecrets(ctx, req(), first.res, { param1: "dev" });
    const listing = first.fake.payload as { version: string };
    const sentinel = "FAKE_SENTINEL_0928_NEVER_ECHO";
    const put = response();
    await mutateProjectEnvironmentSecret(ctx, req(JSON.stringify({ action: "replace", key: "TOKEN", value: sentinel, version: listing.version })), put.res, { param1: "dev" });
    expect(put.fake.status).toBe(200);
    const secretFree = JSON.stringify(put.fake.payload) + JSON.stringify(auth.getAuditLog(20));
    expect(secretFree).not.toContain(sentinel);
    const stale = response();
    await mutateProjectEnvironmentSecret(ctx, req(JSON.stringify({ action: "replace", key: "TOKEN", value: "another", version: listing.version })), stale.res, { param1: "dev" });
    expect(stale.fake.status).toBe(409);
    const reread = response();
    listProjectEnvironmentSecrets(ctx, req(), reread.res, { param1: "dev" });
    expect(JSON.stringify(reread.fake.payload)).not.toContain(sentinel);
  });
});

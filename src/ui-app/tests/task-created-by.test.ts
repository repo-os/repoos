/**
 * Task creation now records who actually created it, once RepoOS has real
 * identified users (native auth) — previously createdBy always defaulted to
 * "" regardless of who was logged in, since routes/tasks.ts never looked up
 * the session at all.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";
import { SESSION_COOKIE_NAME } from "../../core/auth";

const tmpRoots: string[] = [];

afterEach(() => {
  resetAuthStoreInstance();
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-createdby-"));
  tmpRoots.push(dir);
  return dir;
}

async function withServer(root: string, fn: (s: ServerHandle) => Promise<void>): Promise<void> {
  const server = await startServer({ root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

describe("task createdBy from the authenticated session", () => {
  it("stays empty when auth is disabled (no session concept)", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "No auth task" }),
      });
      expect(res.status).toBe(201);
      const task = (await res.json()) as { absPath: string };
      expect(readFileSync(task.absPath, "utf8")).toMatch(/created_by: ""/);
    });
  });

  it("records the logged-in user's email when auth is enabled", async () => {
    const root = tmpDir();
    writeFileSync(
      join(root, "repoos.toml"),
      '[auth]\nenabled = true\n\n[auth.emailProvider]\ntype = "resend"\napiKey = "re_test"\nfromAddress = "noreply@x.com"\n',
      "utf8",
    );
    const store = getAuthStore(root)!;
    store.upsertUser("engineer@example.com", "member", null);
    const token = store.createSession("engineer@example.com", "member", 3600);

    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ title: "Authenticated task" }),
      });
      expect(res.status).toBe(201);
      const task = (await res.json()) as { absPath: string };
      expect(readFileSync(task.absPath, "utf8")).toMatch(/created_by: "?engineer@example\.com"?/);
    });
  });
});

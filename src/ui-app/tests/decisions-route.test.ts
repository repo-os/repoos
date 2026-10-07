/**
 * #0730 — GET /api/decisions HTTP contract.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";

async function getJson(server: ServerHandle, path: string) {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("GET /api/decisions", () => {
  it("returns ok, generatedAt, and an items array", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-decisions-route-"));
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "README.md"), "# t\n");
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const { status, body } = await getJson(server, "/api/decisions");
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(typeof body.generatedAt).toBe("string");
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.automationPaused).toBe("boolean");
      if ((body.items as unknown[]).length > 0) {
        const item = (body.items as Record<string, unknown>[])[0];
        expect(item).toMatchObject({
          id: expect.any(String),
          kind: expect.any(String),
          title: expect.any(String),
          cause: expect.objectContaining({ headline: expect.any(String) }),
          actions: expect.any(Array),
          at: expect.any(String),
        });
      }
    } finally {
      await server.close();
    }
  });
});

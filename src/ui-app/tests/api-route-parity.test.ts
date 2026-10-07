/**
 * CLI/API parity guard (#0723).
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { getApiRouteCatalog, clearApiRouteCatalogForTests } from "../../server/api-route-catalog";
import { uncoveredApiRoutes } from "../../cli/api-route-parity";

const tmpRoots: string[] = [];

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  clearApiRouteCatalogForTests();
});

describe("API route parity", () => {
  it("every /api route is covered by a CLI command or the UI-only allowlist", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-parity-"));
    tmpRoots.push(root);
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const routes = getApiRouteCatalog();
      expect(routes.length).toBeGreaterThan(50);
      const missing = uncoveredApiRoutes(routes);
      if (missing.length) {
        const lines = missing.map((r) => `  ${r.method} ${r.pattern}`).join("\n");
        expect.fail(`Uncovered API routes (add CLI or allowlist):\n${lines}`);
      }
    } finally {
      await server.close();
    }
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/server";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
let root = "";

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = "";
  }
});

describe("stale asset handling", () => {
  it("serves a real 404 for missing hashed assets and SPA fallback for unknown routes", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-stale-asset-"));
    mkdirSync(join(root, "dist", "ui"), { recursive: true });
    writeFileSync(
      join(root, "dist", "ui", "index.html"),
      "<!doctype html><html><body>repoos shell</body></html>",
    );

    server = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    const base = `http://127.0.0.1:${server.port}`;

    const missing = await fetch(`${base}/assets/does-not-exist-abc123.js`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Asset not found");

    const spa = await fetch(`${base}/agents`);
    expect(spa.status).toBe(200);
    expect(spa.headers.get("content-type") ?? "").toContain("text/html");
    expect(await spa.text()).toContain("repoos shell");
  });
});

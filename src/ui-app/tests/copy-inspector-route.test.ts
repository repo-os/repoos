import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";

function writeDevUiBuild(root: string): void {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(
    join(root, "dist", ".build-info.json"),
    `${JSON.stringify({ hash: "test", version: "0.0.0-test", devUi: true })}\n`,
    "utf8",
  );
}

async function request(server: ServerHandle, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/dev/copy-inspector/open", () => {
  it("is unavailable without a dev UI build marker", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-copy-inspector-route-"));
    mkdirSync(join(root, "src/ui-app"), { recursive: true });
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "src/ui-app/vite.config.ts"), "export {}", "utf8");
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const res = await request(server, "POST", "/api/dev/copy-inspector/open", {
        file: "src/ui-app/App.vue",
        line: 1,
      });
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("is unavailable when the repo has no RepoOS UI sources", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-copy-inspector-route-"));
    mkdirSync(join(root, "work"), { recursive: true });
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const res = await request(server, "POST", "/api/dev/copy-inspector/open", {
        file: "src/ui-app/src/App.vue",
        line: 1,
      });
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("path-guards targets to files under src/", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-copy-inspector-route-"));
    mkdirSync(join(root, "src/ui-app"), { recursive: true });
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "src/ui-app/vite.config.ts"), "export {}", "utf8");
    writeFileSync(join(root, "src/ui-app/App.vue"), "<template></template>", "utf8");
    writeDevUiBuild(root);
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      await request(server, "PATCH", "/api/config", {
        "dev.inspector.enabled": true,
        "dev.inspector.editorCommand": "echo {file}",
      });

      const bad = await request(server, "POST", "/api/dev/copy-inspector/open", {
        file: "docs/README.md",
      });
      expect(bad.status).toBe(400);

      const ok = await request(server, "POST", "/api/dev/copy-inspector/open", {
        file: "src/ui-app/App.vue",
        line: 3,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.ok).toBe(true);
      expect(ok.body.path).toBe("src/ui-app/App.vue:3");
    } finally {
      await server.close();
    }
  });

  it("returns 500 (and keeps serving) when the editor binary does not exist", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-copy-inspector-route-"));
    mkdirSync(join(root, "src/ui-app"), { recursive: true });
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "src/ui-app/vite.config.ts"), "export {}", "utf8");
    writeFileSync(join(root, "src/ui-app/App.vue"), "<template></template>", "utf8");
    writeDevUiBuild(root);
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      await request(server, "PATCH", "/api/config", {
        "dev.inspector.enabled": true,
        "dev.inspector.editorCommand": "repoos-no-such-editor-binary {file}",
      });
      const res = await request(server, "POST", "/api/dev/copy-inspector/open", {
        file: "src/ui-app/App.vue",
        line: 1,
      });
      expect(res.status).toBe(500);
      // An unhandled async spawn "error" would have taken the server down.
      const health = await fetch(`http://127.0.0.1:${server.port}/api/health`);
      expect(health.status).toBe(200);
    } finally {
      await server.close();
    }
  });
});

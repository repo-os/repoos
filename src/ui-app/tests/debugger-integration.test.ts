import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { debuggerSessionId } from "../../server/agents";

interface Fixture {
  root: string;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-dbg-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(bin, "opencode"),
    `#!/usr/bin/env node
console.log(JSON.stringify({ type: "text", text: "diagnosis from fake" }));
`,
    { mode: 0o755 },
  );
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  return {
    root,
    clean: () => {
      // no-op; tmpdir cleans itself
    },
  };
}

async function request(server: ServerHandle, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe("debugger agent integration", () => {
  it("serves /api/debugger and persists enable via PATCH /api/config", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${join(fx.root, "bin")}:${oldPath}`;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const initial = await request(server, "GET", "/api/debugger");
      expect(initial.status).toBe(200);
      expect(initial.body.enabled).toBe(false);

      // Message while disabled -> 400
      const beforeMsg = await request(server, "POST", "/api/debugger/message", { text: "boom" });
      expect(beforeMsg.status).toBe(400);

      const patch = await request(server, "PATCH", "/api/config", {
        builtInAgents: { debugger: { enabled: true, schedule: "manual" } },
      });
      expect(patch.status).toBe(200);

      const after = await request(server, "GET", "/api/debugger");
      expect(after.body.enabled).toBe(true);

      const sidecar = join(fx.root, ".repoos", "built-in-agents.json");
      expect(existsSync(sidecar)).toBe(true);
      const persisted = JSON.parse(readFileSync(sidecar, "utf8"));
      expect(persisted.debugger.enabled).toBe(true);

      // Invalid shape rejected
      const bad = await request(server, "PATCH", "/api/config", { builtInAgents: 42 });
      expect(bad.status).toBe(400);
    } finally {
      process.env.PATH = oldPath;
      await server.close();
      fx.clean();
    }
  });

  it("runs a diagnosis when enabled and serves it back", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${join(fx.root, "bin")}:${oldPath}`;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      await request(server, "PATCH", "/api/config", {
        builtInAgents: { debugger: { enabled: true } },
      });
      const sent = await request(server, "POST", "/api/debugger/message", { text: "boom" });
      expect(sent.status).toBe(200);

      // Wait for the fake agent turn to complete and its output to surface.
      const start = Date.now();
      let lines: any[] = [];
      while (Date.now() - start < 8000) {
        const state = await request(server, "GET", "/api/debugger");
        lines = state.body.lines ?? [];
        if (lines.some((l: any) => (l as any).type === "text" || (l as any).s === "out")) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      expect(lines.length).toBeGreaterThan(0);

      const textEntries = lines.filter(
        (l: any) => (l as any).type === "text" || (l as any).s === "out",
      );
      expect(textEntries.length).toBeGreaterThan(0);
    } finally {
      process.env.PATH = oldPath;
      await server.close();
      fx.clean();
    }
  });

  it("keeps the chat panel's session id aligned with the server session id", () => {
    // Regression guard (0201 review): the panel reads SSE agent.output /
    // agent.running / agent.exited events keyed by the server's session id. If
    // the two drift apart, live output and busy state silently stop routing to
    // the panel even though the transcript still hydrates on mount.
    const source = readFileSync(
      resolve(__dirname, "../src/components/DebuggerChat.vue"),
      "utf8",
    );
    expect(source).toContain(`const CHAT_ID = "${debuggerSessionId}"`);
  });
});

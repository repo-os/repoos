import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp, nextTick, type App } from "vue";
import { createPinia } from "pinia";
import { startServer, type ServerHandle } from "../../server/server";
import { debuggerSessionId } from "../../server/agents";
import DebuggerChat from "../src/components/DebuggerChat.vue";
import { useRepoStore } from "../src/stores/repo";
import type { AgentOutputEntry } from "../src/types";

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
    expect(source).toContain("Change agent or model");
    // 0275: the "Change agent or model" button must open the inline agent/model
    // selection modal, NOT navigate to the Agents page. The modal must be
    // present and wired so the persisted debugger cli/model actually drives it.
    expect(source).toContain("AgentModelModal");
    expect(source).toContain("@click=\"openModelSelection\"");
    expect(source).not.toContain("router.push({ name: \"agents\" })");
  });

  it("rejects the built-in run endpoint for the chat-only Debugger", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${join(fx.root, "bin")}:${oldPath}`;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const res = await request(server, "POST", "/api/agents/built-in/debugger/run", {});
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error)).toContain("chat-only");
    } finally {
      process.env.PATH = oldPath;
      await server.close();
      fx.clean();
    }
  });
});

// ---- 0275: false "could not respond" + model selection via the chat panel ----

const CHAT_STATE = {
  ok: true,
  enabled: true,
  agent: { name: "debugger", cli: "opencode", model: "deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731", enabled: true, instructions: "" },
  running: false,
  lines: [] as AgentOutputEntry[],
  stats: { accumulatedMs: 0, turnStartedAt: null, lastOutputAt: null, tokens: null, costUsd: null, stalled: false },
};

function configResponse(builtInAgents: Record<string, unknown>) {
  return {
    config: { builtInAgents, agents: [], whisperEnabled: false, tunnelEnabled: false },
    schema: [],
    agentsMeta: { clis: ["opencode", "claude code"], models: ["default", "test-model"], defaults: [] },
  };
}

let mountedApp: App<Element> | null = null;

async function mountChat(lines: AgentOutputEntry[], fetchMock: typeof fetch): Promise<HTMLElement> {
  vi.stubGlobal("fetch", fetchMock);
  const host = document.createElement("div");
  document.body.append(host);
  const appRoot = { template: '<DebuggerChat :open="true" />', components: { DebuggerChat } };
  mountedApp = createApp(appRoot);
  mountedApp.use(createPinia());
  mountedApp.mount(host);
  // Give config.load() / hydrate() a chance to run, then drive the transcript.
  await nextTick();
  await Promise.resolve();
  await nextTick();
  const repo = useRepoStore();
  repo.outputs = { ...repo.outputs, [debuggerSessionId]: lines };
  await nextTick();
  return host;
}

function serveEndpoints(builtInAgents: Record<string, unknown>, lines: AgentOutputEntry[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.startsWith("/api/debugger")) {
      return new Response(JSON.stringify({ ...CHAT_STATE, enabled: true, lines }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/config")) {
      return new Response(JSON.stringify(configResponse(builtInAgents)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/models")) {
      return new Response(JSON.stringify({ byCli: { opencode: [] }, sources: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } });
  });
}

afterEach(() => {
  mountedApp?.unmount();
  mountedApp = null;
  document.body.textContent = "";
  vi.unstubAllGlobals();
});

describe("Debugger providerError (0275 false-negative)", () => {
  it("does NOT show 'could not respond' when the diagnosis succeeded, even if its text mentions 'connection'", async () => {
    const diagnosis: AgentOutputEntry[] = [
      { type: "human", text: "here is a bug", at: new Date().toISOString() },
      {
        type: "text",
        text: "The root cause is a stale connection handshake in the task runner; the task file conflict auto-resolves on retry.",
        at: new Date().toISOString(),
      },
    ];
    const host = await mountChat(diagnosis, serveEndpoints({ debugger: { enabled: true } }, diagnosis) as typeof fetch);
    expect(host.querySelector(".debugger-provider-error")).toBeNull();
  });

  it("DOES show 'could not respond' when a real sys/err error line ends the current turn", async () => {
    const failing: AgentOutputEntry[] = [
      { type: "human", text: "why is it failing?", at: new Date().toISOString() },
      { type: "sys", d: "error: rate limited — out of credit", at: new Date().toISOString() },
    ];
    const host = await mountChat(failing, serveEndpoints({ debugger: { enabled: true } }, failing) as typeof fetch);
    await nextTick();
    expect(host.querySelector(".debugger-provider-error")).not.toBeNull();
    const strong = host.querySelector(".debugger-provider-error strong");
    expect(strong?.textContent).toContain("could not respond");
  });

  it("ignores a stale error from an earlier turn once a newer human message starts it over", async () => {
    const mixed: AgentOutputEntry[] = [
      { type: "human", text: "first", at: new Date().toISOString() },
      { type: "sys", d: "error: rate limited", at: new Date().toISOString() },
      { type: "human", text: "retry", at: new Date().toISOString() },
      { type: "text", text: "All good now.", at: new Date().toISOString() },
    ];
    const host = await mountChat(mixed, serveEndpoints({ debugger: { enabled: true } }, mixed) as typeof fetch);
    await nextTick();
    expect(host.querySelector(".debugger-provider-error")).toBeNull();
  });
});

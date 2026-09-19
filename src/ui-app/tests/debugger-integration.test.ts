import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { debuggerSessionId } from "../../server/agents";
import { waitFor } from "./helpers";

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

/** A minimal task file so the task-scoped debugger route resolves a task. */
function addTask(root: string, id: string): void {
  writeFileSync(
    join(root, "work", `${id}-fixture-task.md`),
    `---
id: "${id}"
title: Fixture task
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: test
---
Body for ${id}.
`,
  );
}

async function request(server: ServerHandle, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

/**
 * Tap the real SSE stream. The fix under test is about what the *client*
 * receives live, so assertions read the same event frames the UI does rather
 * than only the polled `/api/debugger` snapshot.
 */
async function openEvents(
  server: ServerHandle,
): Promise<{ events: any[]; close: () => Promise<void> }> {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/events`, {
    headers: { accept: "text/event-stream" },
  });
  const events: any[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let running = true;
  const pump = (async () => {
    try {
      while (running) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const data = frame.split("\n").find((line) => line.startsWith("data: "));
          if (data) {
            try {
              events.push(JSON.parse(data.slice(6)));
            } catch {
              /* ignore a partial frame */
            }
          }
          split = buffer.indexOf("\n\n");
        }
      }
    } catch {
      /* stream torn down */
    }
  })();
  return {
    events,
    close: async () => {
      running = false;
      await reader.cancel().catch(() => {});
      await pump;
    },
  };
}

/** The human turns broadcast for one session id, in arrival order. */
function humanTurns(events: any[], sessionId: string): string[] {
  return events
    .filter((e) => e?.type === "agent.output" && e?.id === sessionId && e?.entry?.type === "human")
    .map((e) => String(e.entry.text));
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

  it("broadcasts a forwarded message as a human turn (#0443)", async () => {
    // "Send to Debugger" posts the failure straight to /api/debugger/message
    // from another surface — there is no client-side optimistic insert, so
    // without a server broadcast the transcript opens on the assistant's reply
    // with no visible prompt.
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${join(fx.root, "bin")}:${oldPath}`;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    const stream = await openEvents(server);
    try {
      await request(server, "PATCH", "/api/config", {
        builtInAgents: { debugger: { enabled: true } },
      });
      // No `optimistic` flag: this is a programmatic forward, not the panel's
      // own compose box.
      const sent = await request(server, "POST", "/api/debugger/message", {
        text: "release failed at check",
      });
      expect(sent.status).toBe(200);

      await waitFor(
        () => humanTurns(stream.events, debuggerSessionId).length > 0,
        " forwarded message to be broadcast as a human turn",
      );
      expect(humanTurns(stream.events, debuggerSessionId)).toEqual(["release failed at check"]);

      // It is also part of the transcript the panel hydrates from, so it
      // survives a reload rather than being a one-off broadcast.
      const state = await request(server, "GET", "/api/debugger");
      expect(state.body.lines[0]).toMatchObject({ type: "human", text: "release failed at check" });
    } finally {
      await stream.close();
      process.env.PATH = oldPath;
      await server.close();
      fx.clean();
    }
  });

  it("does not re-broadcast a turn the panel already drew optimistically (#0443)", async () => {
    // The panel inserts its own human bubble before the request; a broadcast
    // would render the same message twice.
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${join(fx.root, "bin")}:${oldPath}`;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    const stream = await openEvents(server);
    try {
      await request(server, "PATCH", "/api/config", {
        builtInAgents: { debugger: { enabled: true } },
      });
      const sent = await request(server, "POST", "/api/debugger/message", {
        text: "typed by the human",
        optimistic: true,
      });
      expect(sent.status).toBe(200);

      // Wait until the agent has actually answered, so the stream is
      // demonstrably live — then assert no human turn was pushed with it.
      await waitFor(
        () => stream.events.some((e) => e?.type === "agent.output" && e?.id === debuggerSessionId),
        " the debugger turn to stream output",
      );
      expect(
        stream.events.some((e) => e?.type === "agent.output" && e?.id === debuggerSessionId),
      ).toBe(true);
      expect(humanTurns(stream.events, debuggerSessionId)).toEqual([]);
    } finally {
      await stream.close();
      process.env.PATH = oldPath;
      await server.close();
      fx.clean();
    }
  });

  it("broadcasts a forwarded message as a human turn in the task debugger (#0443)", async () => {
    // The "Fix" handoff on a failed Move-to-done posts to the task-scoped
    // debugger; it needs the same human turn as the global one.
    const fx = makeFixture();
    addTask(fx.root, "0356");
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${join(fx.root, "bin")}:${oldPath}`;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    const stream = await openEvents(server);
    try {
      await request(server, "PATCH", "/api/config", {
        builtInAgents: { debugger: { enabled: true } },
      });
      const sent = await request(server, "POST", "/api/tasks/0356/debugger/message", {
        text: "please investigate this failed Move-to-done",
      });
      expect(sent.status).toBe(200);

      await waitFor(
        () => humanTurns(stream.events, "debugger:0356").length > 0,
        " forwarded task message to be broadcast as a human turn",
      );
      expect(humanTurns(stream.events, "debugger:0356")).toEqual([
        "please investigate this failed Move-to-done",
      ]);
    } finally {
      await stream.close();
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
    const source = readFileSync(resolve(__dirname, "../src/components/DebuggerChat.vue"), "utf8");
    expect(source).toContain(`const CHAT_ID = "${debuggerSessionId}"`);
    expect(source).toContain("Change agent or model");
    expect(source).toContain("useRouter");
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

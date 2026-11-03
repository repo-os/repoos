/**
 * #1018 — one idle client must put almost no load on the server.
 *
 * The incident had the renderer and GPU busy for days and the server
 * unresponsive. The UI side is covered by `idle-board-budget.test.ts`; this
 * pins the server half: the SSE stream announces a jittered retry window (so a
 * restart does not sync every tab's reconnect) and an idle client receives
 * nothing but `hello` — no per-second poll/event chatter.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/server";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
let root = "";
let controller: AbortController | null = null;

afterEach(async () => {
  controller?.abort();
  controller = null;
  if (server) {
    await server.close();
    server = null;
  }
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = "";
  }
});

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-sse-idle-"));
  mkdirSync(join(dir, "work"), { recursive: true });
  writeFileSync(join(dir, "repoos.toml"), 'theme = "dark"\nuiTheme = "classic"\n');
  return dir;
}

/** Collect a short window of the SSE body without hanging when it is quiet. */
async function readWindow(body: ReadableStream<Uint8Array>, ms: number): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const read = await Promise.race([
      reader.read().then((r) => (r.done ? null : r.value)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
    ]);
    if (read === null) break;
    text += decoder.decode(read, { stream: true });
  }
  return text;
}

describe("idle SSE client (#1018)", () => {
  it("advertises a jittered retry window and stays quiet while idle", async () => {
    root = fixture();
    server = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    const base = `http://127.0.0.1:${server.port}`;

    controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");

    const text = await readWindow(res.body!, 1_500);
    const retry = /^retry: (\d+)$/m.exec(text)?.[1];
    expect(retry).toBeDefined();
    expect(Number(retry)).toBeGreaterThanOrEqual(1_000);
    expect(Number(retry)).toBeLessThanOrEqual(3_000);

    // The only frame a quiet fixture emits in this window is `hello`.
    const events = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
    expect(events).toEqual(["hello"]);
    expect(text).not.toContain("system.stats");
  });

  it("does not fan out one idle client's events to the board every second", async () => {
    root = fixture();
    server = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    const base = `http://127.0.0.1:${server.port}`;

    controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: controller.signal });
    const text = await readWindow(res.body!, 4_000);

    // In four seconds: hello plus at most the single 5s system sample landing
    // early. Certainly not a task.updated/attention.updated stream.
    const events = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
    expect(events.length).toBeLessThanOrEqual(2);
    expect(events.filter((e) => e === "task.updated")).toHaveLength(0);
    expect(events.filter((e) => e === "attention.updated")).toHaveLength(0);
  });
});

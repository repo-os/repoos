// @vitest-environment node
/**
 * #1244 — QA pass: Control dashboard live updates across a dropped connection,
 * at 375/768/1280px. The built UI (`dist/ui`) is served from a fixture server
 * in this process, and the page runs in headless WebKit. The fixture server
 * stops listening to simulate a server outage (connection refused, streams
 * closed) and then listens again on the same port.
 *
 * Each width checks the whole recovery path: the header shows a plain-English
 * "reconnecting" pill during the outage, the board catches up on its own
 * after the server returns (a count that changed while the server was down
 * shows up without a reload), and the pill clears. The page is never reloaded.
 *
 * Set `QA_SHOTS=<dir>` to save a screenshot per width and state.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const VIEWPORTS = [375, 768, 1280] as const;
const uiDist = resolve(__dirname, "../../../dist/ui");
const shotDir = process.env.QA_SHOTS;

interface Fixture {
  ready: number;
  streams: Set<ServerResponse>;
  /** Board requests to refuse after a restart, like a server still finishing its boot index. */
  boardRefusals: number;
}

const fixture: Fixture = { ready: 0, streams: new Set(), boardRefusals: 0 };

const COUNTS = (ready: number) => ({ draft: 0, inbox: 0, ready, active: 0, review: 0, done: 0 });

/** Route one request against the fixture API; anything unknown gets an empty object. */
function handle(req: IncomingMessage, res: ServerResponse, root: string): void {
  const url = new URL(req.url ?? "/", "http://fixture.local");
  const path = url.pathname;
  if (path === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(`retry: 1000\n\n`);
    res.write(
      `event: hello\ndata: ${JSON.stringify({ type: "hello", taskCount: 0, at: "fixture" })}\n\n`,
    );
    fixture.streams.add(res);
    req.on("close", () => fixture.streams.delete(res));
    return;
  }
  if (path === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        root,
        projectName: "fixture-repo",
        branch: "main",
        taskCount: fixture.ready,
        workDir: "work",
        restartCommand: "repoos serve",
      }),
    );
    return;
  }
  if (path === "/api/board") {
    if (fixture.boardRefusals > 0) {
      fixture.boardRefusals--;
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "index still building" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tasks: [], counts: COUNTS(fixture.ready), taskCount: fixture.ready }));
    return;
  }
  if (path.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
    return;
  }
  void serveStatic(path, res);
}

async function serveStatic(path: string, res: ServerResponse): Promise<void> {
  const rel = path === "/" ? "index.html" : path.slice(1);
  const types: Record<string, string> = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  try {
    const body = await readFile(join(uiDist, rel));
    res.writeHead(200, { "Content-Type": types[extname(rel)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    // SPA fallback: unknown client routes get the app shell.
    const shell = await readFile(join(uiDist, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(shell);
  }
}

describe("Control dashboard live recovery at 375/768/1280 (WebKit, fixtures)", () => {
  let browser: Browser;
  let server: Server;
  let port = 0;
  let baseUrl = "";
  let up = true;

  /** Stop listening: refuses new connections and closes open streams. */
  async function outage(): Promise<void> {
    up = false;
    for (const res of fixture.streams) res.destroy();
    fixture.streams.clear();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }

  /** Listen again on the same port, the way a restarted server comes back. */
  async function restore(): Promise<void> {
    if (up) return;
    server = createServer((req, res) => handle(req, res, "/tmp/fixture-repo"));
    await new Promise<void>((done) => server.listen(port, "127.0.0.1", done));
    up = true;
    // The first board request after the restart is refused, so the reconnect
    // refresh fails and only the store's own retry can bring the count up to date.
    fixture.boardRefusals = 1;
  }

  beforeAll(async () => {
    // Fail loudly rather than silently testing an old bundle.
    await readFile(join(uiDist, "index.html")).catch(() => {
      throw new Error("dist/ui is missing — run `bun run build:ui` before this test");
    });
    browser = await webkit.launch();
    server = createServer((req, res) => handle(req, res, "/tmp/fixture-repo"));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    if (shotDir) mkdirSync(shotDir, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
    server?.closeAllConnections();
    await new Promise<void>((done) => server?.close(() => done()) ?? done());
  });

  async function shoot(page: Page, name: string): Promise<void> {
    if (!shotDir) return;
    await page.screenshot({ path: join(shotDir, name), fullPage: false });
  }

  for (const width of VIEWPORTS) {
    it(`reconnects, catches up, and clears the pill at ${width}px without a reload`, async () => {
      fixture.ready = 0;
      fixture.boardRefusals = 0;
      const page = await browser.newPage({ viewport: { width, height: 812 } });
      try {
        // Mission Control lives at /control; `/` now redirects to Work (#1258).
        await page.goto(baseUrl + "/control");
        await page
          .locator(".stat-link", { hasText: "ready to start" })
          .waitFor({ state: "visible", timeout: 30_000 });
        // Live: no pill while the stream is up.
        await page.waitForTimeout(500);
        expect(await page.locator(".conn").count()).toBe(0);

        // Mark the page so a reload would be visible.
        await page.evaluate(() => {
          (window as unknown as { __qaMarker: number }).__qaMarker = 1;
        });

        // The connection drops, and the server changes while it is down.
        await outage();
        fixture.ready = 3;

        // Within the grace window the pill shows a plain-English reconnecting state.
        const pill = page.locator(".conn");
        await pill.waitFor({ state: "visible", timeout: 15_000 });
        expect((await pill.textContent())?.trim()).toBe("reconnecting");
        const box = await pill.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        // The word must be readable, not just a dot: its own box has text width.
        expect(box!.width).toBeGreaterThan(60);
        await shoot(page, `reconnecting-${width}.png`);

        // Server returns: the stream reconnects and the board catches up on its own.
        await restore();
        await pill.waitFor({ state: "detached", timeout: 40_000 });
        const readyCard = page.locator(".stat-link", { hasText: "ready to start" });
        await expect
          .poll(async () => (await readyCard.textContent()) ?? "", { timeout: 10_000 })
          .toContain("3");
        expect(
          await page.evaluate(() => (window as unknown as { __qaMarker?: number }).__qaMarker),
        ).toBe(1);
        await shoot(page, `recovered-${width}.png`);

        // Document never widens past the viewport while reconnecting.
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(width);
      } finally {
        // A failed assertion mid-outage must not leave the server down for the next width.
        await restore();
        await page.close();
      }
    }, 120_000);
  }
});

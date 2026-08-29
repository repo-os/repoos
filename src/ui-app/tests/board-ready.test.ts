/**
 * Board-readiness guard (#0285).
 *
 * A reload handoff spawns the replacement process with the listener already
 * accepting connections while the full index build (`refreshAllAsync`) runs
 * in the background. The client's `EventSource.onopen` fires `GET /api/board`
 * immediately on reconnect; if that request is answered from a half-built
 * index the board shows a stale/partial snapshot that nothing ever corrects.
 *
 * The fix: the board (and index) routes `await ctx.indexReady` — the boot
 * index-build promise — so a request racing boot can never be answered from
 * a partially-built index. This test locks that in end-to-end: a request to
 * the board route must not be answered until `indexReady` resolves.
 */
import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { RouteContext } from "../../server/routes/types.js";
import type { BoardIndex } from "../../core/types.js";
import { getBoard } from "../../server/routes/info.js";

const EMPTY_BOARD: BoardIndex = {
  version: 1,
  generatedAt: new Date().toISOString(),
  root: "/tmp/x",
  taskCount: 0,
  tasks: [],
  counts: { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 },
};

/** Boot a real HTTP server that serves the board route through the given ctx. */
async function serve(ctx: RouteContext): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    void getBoard(ctx, req, res, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { url: `http://127.0.0.1:${addr.port}/api/board`, close };
}

describe("getBoard readies behind the boot index build (#0285)", () => {
  it("does not answer a request that races boot until indexReady resolves", async () => {
    let resolveReady!: (v: void) => void;
    const indexReady = new Promise<void>((r) => {
      resolveReady = r;
    });
    let snapshotCalls = 0;
    const ctx = {
      indexReady,
      index: {
        boardSnapshot: () => {
          snapshotCalls++;
          return EMPTY_BOARD;
        },
      },
      reviews: { isRunning: () => false, enabled: () => false },
    } as unknown as RouteContext;

    const { url, close } = await serve(ctx);
    try {
      const pending = fetch(url).then((r) => r.json());
      // Give the request a chance to reach the handler and block on indexReady.
      await new Promise((r) => setTimeout(r, 50));
      // The snapshot must NOT have been taken before readiness was signalled.
      expect(snapshotCalls).toBe(0);

      resolveReady();
      const body = (await pending) as { taskCount?: number };
      expect(snapshotCalls).toBe(1);
      expect(body.taskCount).toBe(0);
    } finally {
      await close();
    }
  });

  it("answers immediately when the index is already ready", async () => {
    const ctx = {
      indexReady: Promise.resolve(),
      index: {
        boardSnapshot: () => EMPTY_BOARD,
      },
      reviews: { isRunning: () => false, enabled: () => false },
    } as unknown as RouteContext;

    const { url, close } = await serve(ctx);
    try {
      const body = (await (await fetch(url)).json()) as { taskCount?: number };
      expect(body.taskCount).toBe(0);
    } finally {
      await close();
    }
  });
});

/**
 * A task drawer asks for durable usage stats every time it opens (#1139).
 * Branchless tasks have no recorded sessions, so the route must answer with an
 * empty 200 payload instead of a 404 that logs a console error on every open.
 */
import { describe, expect, it, vi } from "vitest";
import { getTaskStats } from "../../server/routes/tasks.js";

function run(stats: unknown) {
  const runner = { taskStats: vi.fn(() => stats) };
  const res = {
    statusCode: 0,
    body: "",
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(payload: string | Buffer) {
      res.body = payload.toString();
    },
  };
  getTaskStats({ runner } as never, {} as never, res as never, { param1: "0042" } as never);
  return { res, runner };
}

describe("GET /api/tasks/:id/stats", () => {
  it("returns 200 with null stats for a task with no sessions", () => {
    const { res, runner } = run(null);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, stats: null });
    expect(runner.taskStats).toHaveBeenCalledWith("0042");
  });

  it("returns the recorded stats unchanged when they exist", () => {
    const stats = { sessions: 2, totalMs: 1200, tokens: 42 };
    const { res } = run(stats);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, stats });
  });
});

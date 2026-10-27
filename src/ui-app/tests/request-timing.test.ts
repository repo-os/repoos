import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchHttpRequest } from "../../server/request-timing.js";

function fakeResponse(): ServerResponse {
  return new EventEmitter() as unknown as ServerResponse;
}

describe("request timing (#0967)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs STUCK with the route and age, then a warn duration, for a slow handler", () => {
    vi.useFakeTimers();
    let clock = 1_000_000;
    const lines: Array<{ level: string; message: string }> = [];
    const res = fakeResponse();

    watchHttpRequest({
      method: "POST",
      path: "/api/slow",
      res,
      now: () => clock,
      log: (level, message) => lines.push({ level, message }),
    });

    clock += 10_000;
    vi.advanceTimersByTime(10_000);

    expect(lines).toEqual([{ level: "warn", message: "STUCK POST /api/slow 10000ms" }]);

    clock += 2_500;
    res.emit("finish");

    expect(lines[1]).toEqual({ level: "warn", message: "POST /api/slow 12500ms" });
  });

  it("logs a fast handler at debug and does not emit STUCK", () => {
    vi.useFakeTimers();
    let clock = 0;
    const lines: Array<{ level: string; message: string }> = [];
    const res = fakeResponse();

    watchHttpRequest({
      method: "GET",
      path: "/api/health",
      res,
      now: () => clock,
      log: (level, message) => lines.push({ level, message }),
    });

    clock = 40;
    res.emit("finish");
    vi.advanceTimersByTime(10_000);

    expect(lines).toEqual([{ level: "debug", message: "GET /api/health 40ms" }]);
  });
});

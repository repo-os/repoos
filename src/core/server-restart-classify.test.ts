import { describe, expect, it, vi } from "vitest";

const getServiceStatus = vi.fn();
vi.mock("./service-manager.js", async (orig) => ({
  ...(await orig<typeof import("./service-manager.js")>()),
  getServiceStatus: (...a: unknown[]) => getServiceStatus(...a),
}));
vi.mock("./supervisor-detect.js", async (orig) => ({
  ...(await orig<typeof import("./supervisor-detect.js")>()),
  detectSupervisor: () => ({ kind: "none" }),
}));

import { classifyRestartPath } from "./server-restart.js";

const located = (port: number) => ({
  port,
  host: "127.0.0.1",
  pid: 10,
  version: null,
  serveFlags: [],
  source: "lockfile" as const,
});

describe("classifyRestartPath (#1091)", () => {
  it("uses the managed service only when it owns the located server's port", async () => {
    getServiceStatus.mockResolvedValue({ status: "running", port: 7272 });
    expect(await classifyRestartPath("/r", located(7272))).toBe("managed-service");
    // A hand-run server on another port must not bounce the managed service.
    expect(await classifyRestartPath("/r", located(7373))).toBe("hand-run");
  });
});

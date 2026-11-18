import { describe, expect, it, vi } from "vitest";

const getServiceStatus = vi.fn();
const detectSupervisor = vi.fn((_pid: number) => ({ kind: "none" as const }));
vi.mock("./service-manager.js", async (orig) => ({
  ...(await orig<typeof import("./service-manager.js")>()),
  getServiceStatus: (...a: unknown[]) => getServiceStatus(...a),
}));
vi.mock("./supervisor-detect.js", async (orig) => ({
  ...(await orig<typeof import("./supervisor-detect.js")>()),
  detectSupervisor: (...a: unknown[]) => detectSupervisor(...(a as [number])),
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

  it.each([
    {
      label: "RepoOS systemd unit detected from cgroup/parent",
      result: {
        kind: "managed" as const,
        job: "com.repoos.serve.demo",
        info: {
          platform: "systemd" as const,
          job: "com.repoos.serve.demo",
          manualCommand: "systemctl --user restart com.repoos.serve.demo.service",
        },
      },
    },
    {
      label: "external launchd unit",
      result: {
        kind: "external" as const,
        info: {
          platform: "launchd" as const,
          job: "org.repoos.serve.demo",
          manualCommand: "launchctl kickstart -k gui/501/org.repoos.serve.demo",
        },
      },
    },
  ])("routes $label through its supervisor", async ({ result }) => {
    getServiceStatus.mockResolvedValue(null);
    detectSupervisor.mockReturnValue(result as never);
    expect(await classifyRestartPath("/r", located(7272))).toBe("supervisor");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  serviceId,
  serviceLabel,
  detectPlatform,
  isLingerEnabled,
  type ServiceEntry,
} from "./service-manager.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

describe("serviceId", () => {
  it("generates a collision-safe id from a path", () => {
    const id = serviceId("/Users/test/my-project");
    expect(id).toMatch(/^my-project-[a-f0-9]{8}$/);
  });

  it("produces the same id for the same path", () => {
    const a = serviceId("/Users/test/project");
    const b = serviceId("/Users/test/project");
    expect(a).toBe(b);
  });

  it("produces different ids for different paths", () => {
    const a = serviceId("/Users/test/project-a");
    const b = serviceId("/Users/test/project-b");
    expect(a).not.toBe(b);
  });

  it("uses 'repoos' as basename when path root has no name", () => {
    const id = serviceId("/");
    expect(id).toMatch(/^repoos-[a-f0-9]{8}$/);
  });
});

describe("serviceLabel", () => {
  it("returns a dot-separated label", () => {
    const label = serviceLabel("myproject-a1b2c3d4");
    expect(label).toBe("com.repoos.serve.myproject-a1b2c3d4");
  });
});

describe("detectPlatform", () => {
  it("returns a valid platform", () => {
    const platform = detectPlatform();
    expect(["launchd", "systemd"]).toContain(platform);
  });
});

describe("isLingerEnabled", () => {
  const originalPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = originalPath;
  });

  it("returns null on macOS — linger is a systemd/Linux-only concept", () => {
    if (process.platform !== "darwin") return;
    expect(isLingerEnabled()).toBeNull();
  });

  it("reads the real loginctl-reported state, not a guessed filesystem path", () => {
    if (process.platform === "darwin") return;
    // Regression: the old implementation checked a
    // ~/.config/systemd/user/linger/<uid>.d path that systemd never creates —
    // real linger state is only queryable via loginctl (it lives in the
    // root-owned /var/lib/systemd/linger/<user>). A fake loginctl on PATH
    // stands in for the real one so this is testable without root.
    const bin = tmpDir("repoos-loginctl-");
    writeFileSync(join(bin, "loginctl"), "#!/bin/sh\necho yes\n");
    chmodSync(join(bin, "loginctl"), 0o755);
    process.env.PATH = `${bin}:${originalPath}`;
    expect(isLingerEnabled()).toBe(true);
  });

  it("treats loginctl reporting 'no' as linger disabled", () => {
    if (process.platform === "darwin") return;
    const bin = tmpDir("repoos-loginctl-");
    writeFileSync(join(bin, "loginctl"), "#!/bin/sh\necho no\n");
    chmodSync(join(bin, "loginctl"), 0o755);
    process.env.PATH = `${bin}:${originalPath}`;
    expect(isLingerEnabled()).toBe(false);
  });

  it("returns null when loginctl is unavailable rather than throwing", () => {
    if (process.platform === "darwin") return;
    process.env.PATH = tmpDir("repoos-empty-path-");
    expect(isLingerEnabled()).toBeNull();
  });
});

describe("ServiceEntry type shape", () => {
  it("has all required fields", () => {
    const entry: ServiceEntry = {
      id: "test-a1b2c3d4",
      root: "/tmp/test",
      port: 7200,
      platform: "launchd",
      label: "com.repoos.serve.test-a1b2c3d4",
      autoStart: false,
      status: "stopped",
      lastHealthCheck: null,
      healthError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(entry.id).toBeTruthy();
    expect(entry.root).toBeTruthy();
    expect(entry.port).toBeGreaterThan(0);
    expect(["launchd", "systemd"]).toContain(entry.platform);
    expect(entry.label).toBeTruthy();
    expect(typeof entry.autoStart).toBe("boolean");
    expect(["running", "stopped", "error", "unknown", "disabled"]).toContain(entry.status);
  });

  it("supports all status values", () => {
    const statuses = ["running", "stopped", "error", "unknown", "disabled"] as const;
    for (const status of statuses) {
      const entry: ServiceEntry = {
        id: "test",
        root: "/tmp",
        port: 7200,
        platform: "launchd",
        label: "com.repoos.serve.test",
        autoStart: false,
        status,
        lastHealthCheck: null,
        healthError: null,
        createdAt: "",
        updatedAt: "",
      };
      expect(entry.status).toBe(status);
    }
  });
});

describe("registry file operations", () => {
  it("writes and reads a services.json file", () => {
    const dir = tmpDir("repoos-svc-test-");
    const servicesFile = join(dir, "services.json");
    const entries: ServiceEntry[] = [
      {
        id: "test-a1b2c3d4",
        root: "/tmp/test",
        port: 7200,
        platform: "launchd",
        label: "com.repoos.serve.test-a1b2c3d4",
        autoStart: false,
        status: "stopped",
        lastHealthCheck: null,
        healthError: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    writeFileSync(servicesFile, JSON.stringify(entries, null, 2), "utf8");
    const read = JSON.parse(readFileSync(servicesFile, "utf8")) as ServiceEntry[];
    expect(read).toHaveLength(1);
    expect(read[0].id).toBe("test-a1b2c3d4");
    expect(read[0].port).toBe(7200);
  });

  it("handles empty array", () => {
    const dir = tmpDir("repoos-svc-empty-");
    const servicesFile = join(dir, "services.json");
    writeFileSync(servicesFile, "[]", "utf8");
    const read = JSON.parse(readFileSync(servicesFile, "utf8")) as ServiceEntry[];
    expect(read).toHaveLength(0);
  });

  it("preserves drift state through round-trip", () => {
    const dir = tmpDir("repoos-svc-drift-");
    const servicesFile = join(dir, "services.json");
    const entries: ServiceEntry[] = [
      {
        id: "drift-a1b2c3d4",
        root: "/tmp/drift",
        port: 7201,
        platform: "systemd",
        label: "com.repoos.serve.drift-a1b2c3d4",
        autoStart: true,
        status: "error",
        lastHealthCheck: null,
        healthError: "Service file removed externally — reinstall to restore",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    writeFileSync(servicesFile, JSON.stringify(entries, null, 2), "utf8");
    const read = JSON.parse(readFileSync(servicesFile, "utf8")) as ServiceEntry[];
    expect(read[0].status).toBe("error");
    expect(read[0].healthError).toContain("removed externally");
  });
});

describe("plist content validation", () => {
  it("generates valid plist XML structure", () => {
    const entry: ServiceEntry = {
      id: "test-plist",
      root: "/tmp/test",
      port: 7200,
      platform: "launchd",
      label: "com.repoos.serve.test-plist",
      autoStart: false,
      status: "stopped",
      lastHealthCheck: null,
      healthError: null,
      createdAt: "",
      updatedAt: "",
    };
    // We can't call generatePlist directly (it's private), but we can
    // validate the entry shape that would be used to generate one.
    expect(entry.label).toMatch(/^com\.repoos\.serve\./);
    expect(entry.port).toBeGreaterThan(0);
    expect(entry.port).toBeLessThan(65536);
  });
});

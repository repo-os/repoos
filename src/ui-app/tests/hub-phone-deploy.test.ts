import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hubLaunchComponent, LaunchComponentError } from "../../../scripts/lib/launch-component.js";
import {
  APP_ID,
  connectToPhone,
  findConnectedSerial,
  resolvePhoneTarget,
  runHubPhoneDeploy,
  signatureMismatchMessage,
  unreachableMessage,
  type AdbExec,
  type DeployDeps,
} from "../../../scripts/lib/hub-phone-deploy.js";

describe("hubLaunchComponent", () => {
  it("builds a fully qualified debug component", () => {
    expect(hubLaunchComponent("org.repoos.mobile.dev", "org.repoos.mobile.MainActivity")).toBe(
      "org.repoos.mobile.dev/org.repoos.mobile.MainActivity",
    );
  });

  it("rejects relative, bare, empty, and malformed activity classes", () => {
    const cases: Array<[string, string]> = [
      ["org.repoos.mobile.dev", ".MainActivity"],
      ["org.repoos.mobile.dev", "MainActivity"],
      ["org.repoos.mobile.dev", ""],
      ["", "org.repoos.mobile.MainActivity"],
      ["org.repoos.mobile.dev", "org.repoos.mobile.MainActivity/x"],
    ];
    for (const [appId, activity] of cases) {
      expect(() => hubLaunchComponent(appId, activity)).toThrow(LaunchComponentError);
    }
  });
});

describe("resolvePhoneTarget", () => {
  it("prefers REPOOS_HUB_PHONE over config", () => {
    expect(resolvePhoneTarget({ REPOOS_HUB_PHONE: "10.0.0.1:5555" }, "10.0.0.2:1")).toEqual({
      ip: "10.0.0.1",
      port: "5555",
    });
  });

  it("uses REPOOS_HUB_PHONE_PORT with saved IP", () => {
    expect(resolvePhoneTarget({ REPOOS_HUB_PHONE_PORT: "43100" }, "10.0.0.3:old")).toEqual({
      ip: "10.0.0.3",
      port: "43100",
    });
  });

  it("falls back to saved config", () => {
    expect(resolvePhoneTarget({}, "10.0.0.4:44000")).toEqual({
      ip: "10.0.0.4",
      port: "44000",
    });
  });

  it("errors when nothing is configured", () => {
    const out = resolvePhoneTarget({}, "");
    expect(out).toHaveProperty("error");
  });
});

function makeRecordingAdb(
  handlers: Array<
    (args: string[], serial?: string) => { stdout: string; stderr: string; exitCode: number }
  >,
): AdbExec {
  let i = 0;
  return async (args, opts) => {
    const fn = handlers[i] ?? handlers[handlers.length - 1]!;
    i += 1;
    return fn(args, opts?.serial);
  };
}

describe("connectToPhone", () => {
  it("connects using the saved address", async () => {
    const calls: string[] = [];
    let ready = false;
    const adbExec: AdbExec = async (args, opts) => {
      calls.push(`${opts?.serial ?? ""}:${args.join(" ")}`);
      if (args[0] === "get-state") {
        return ready
          ? { stdout: "device\n", stderr: "", exitCode: 0 }
          : { stdout: "offline\n", stderr: "", exitCode: 1 };
      }
      if (args[0] === "connect") {
        ready = true;
        return { stdout: "connected\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const serial = await connectToPhone(
      { adbExec, sleep: async () => {}, log: () => {} },
      "10.1.0.1",
      "5555",
      false,
      async () => [],
    );
    expect(serial).toBe("10.1.0.1:5555");
    expect(calls.some((c) => c.includes("connect"))).toBe(true);
  });

  it("falls back to another open adb port already connected", async () => {
    const adbExec: AdbExec = async (args) => {
      if (args[0] === "get-state") return { stdout: "offline\n", stderr: "", exitCode: 1 };
      if (args[0] === "connect") return { stdout: "failed\n", stderr: "", exitCode: 1 };
      if (args[0] === "devices") {
        return {
          stdout: "List of devices attached\n10.1.0.1:44001\tdevice\n",
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const serial = await connectToPhone(
      { adbExec, sleep: async () => {}, log: () => {} },
      "10.1.0.1",
      "5555",
      false,
      async () => [],
    );
    expect(serial).toBe("10.1.0.1:44001");
  });

  it("scans open ports when scanning is allowed", async () => {
    const ready = new Set<string>();
    const adbExec: AdbExec = async (args, opts) => {
      if (args[0] === "get-state") {
        if (opts?.serial && ready.has(opts.serial)) {
          return { stdout: "device\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "offline\n", stderr: "", exitCode: 1 };
      }
      if (args[0] === "connect") {
        const target = args[1];
        if (target?.endsWith(":43210")) ready.add(target);
        return { stdout: "connected\n", stderr: "", exitCode: 0 };
      }
      if (args[0] === "devices")
        return { stdout: "List of devices attached\n", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const serial = await connectToPhone(
      { adbExec, sleep: async () => {}, log: () => {} },
      "10.1.0.1",
      "5555",
      true,
      async () => [43210],
    );
    expect(serial).toBe("10.1.0.1:43210");
    expect(ready.has("10.1.0.1:43210")).toBe(true);
  });
});

describe("findConnectedSerial", () => {
  it("picks the matching wireless serial", async () => {
    const adbExec: AdbExec = async () => ({
      stdout: "List of devices attached\n10.9.0.1:40100\tdevice\n",
      stderr: "",
      exitCode: 0,
    });
    expect(await findConnectedSerial(adbExec, "10.9.0.1")).toBe("10.9.0.1:40100");
  });
});

describe("runHubPhoneDeploy", () => {
  function baseDeps(overrides: Partial<DeployDeps> = {}): DeployDeps {
    const dir = mkdtempSync(join(tmpdir(), "hub-deploy-"));
    const apk = join(dir, "app-debug.apk");
    writeFileSync(apk, "fake");
    const configPath = join(dir, "phone");
    return {
      repoRoot: dir,
      homeDir: dir,
      env: { REPOOS_HUB_PHONE: "10.2.0.1:50000" },
      log: vi.fn(),
      die: (msg: string, code = 1): never => {
        throw Object.assign(new Error(msg), { code });
      },
      adbExec: makeRecordingAdb([
        () => ({ stdout: "device\n", stderr: "", exitCode: 0 }),
        () => ({ stdout: "", stderr: "", exitCode: 0 }),
        () => ({ stdout: "Success\n", stderr: "", exitCode: 0 }),
        () => ({ stdout: "", stderr: "", exitCode: 0 }),
        () => ({ stdout: "ok\n", stderr: "", exitCode: 0 }),
      ]),
      sleep: async () => {},
      pathExists: async (p) => p === apk,
      readText: async () => "",
      writeText: async (p, body) => {
        writeFileSync(p, body);
      },
      buildApk: vi.fn(async () => {}),
      commandExists: async () => true,
      scanOpenTcpPorts: async () => [],
      gitShortHead: async () => "abc1234",
      ...overrides,
    };
  }

  it("skips build with --no-build", async () => {
    const deps = baseDeps({
      repoRoot: mkdtempSync(join(tmpdir(), "hub-deploy-")),
    });
    const dir = deps.repoRoot;
    const apk = join(dir, "mobile/android/app/build/outputs/apk/debug/app-debug.apk");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "mobile/android/app/build/outputs/apk/debug"), { recursive: true });
    writeFileSync(apk, "fake");
    const buildApk = vi.fn(async () => {});
    deps.buildApk = buildApk;
    deps.pathExists = async (p) => p === apk;
    await runHubPhoneDeploy({ build: false, scan: false }, deps);
    expect(buildApk).not.toHaveBeenCalled();
  });

  it("dies without scan when the phone is unreachable", async () => {
    const deps = baseDeps({
      adbExec: async (args) => {
        if (args[0] === "get-state") return { stdout: "offline\n", stderr: "", exitCode: 1 };
        if (args[0] === "devices")
          return { stdout: "List of devices attached\n", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });
    const dir = mkdtempSync(join(tmpdir(), "hub-deploy-"));
    deps.repoRoot = dir;
    deps.homeDir = dir;
    const apk = join(dir, "mobile/android/app/build/outputs/apk/debug/app-debug.apk");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "mobile/android/app/build/outputs/apk/debug"), { recursive: true });
    writeFileSync(apk, "fake");
    deps.pathExists = async (p) => p === apk;
    await expect(runHubPhoneDeploy({ build: false, scan: false }, deps)).rejects.toThrow(
      unreachableMessage("10.2.0.1", join(dir, ".config/repoos-hub/phone")),
    );
  });

  it("prints uninstall advice on INSTALL_FAILED_UPDATE_INCOMPATIBLE", async () => {
    const deps = baseDeps();
    const dir = deps.repoRoot;
    const apk = join(dir, "mobile/android/app/build/outputs/apk/debug/app-debug.apk");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "mobile/android/app/build/outputs/apk/debug"), { recursive: true });
    writeFileSync(apk, "fake");
    deps.pathExists = async (p) => p === apk;
    let step = 0;
    deps.adbExec = async (args) => {
      step += 1;
      if (args[0] === "get-state") return { stdout: "device\n", stderr: "", exitCode: 0 };
      if (args[0] === "connect") return { stdout: "", stderr: "", exitCode: 0 };
      if (args[0] === "install") {
        return {
          stdout: "",
          stderr: "INSTALL_FAILED_UPDATE_INCOMPATIBLE\n",
          exitCode: 1,
        };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    await expect(runHubPhoneDeploy({ build: false, scan: false }, deps)).rejects.toThrow(
      signatureMismatchMessage("10.2.0.1:50000", APP_ID),
    );
    expect(step).toBeGreaterThan(0);
  });
});

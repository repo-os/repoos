import { describe, expect, it, vi } from "vitest";
import {
  detectSupervisor,
  launchctlKickstartCommand,
  parseLaunchctlListForPid,
  parseLaunchctlPrintCreator,
  parseSystemdPidStatus,
} from "./supervisor-detect.js";

/** Captured from macOS `launchctl list` (tab-separated). */
const MACOS_LIST_SAMPLE = `PID\tStatus\tLabel
74193\t0\tapplication.local.divot.preview.307783174.307783179
48210\t0\torg.repoos.serve.kamrai
-\t0\tcom.apple.SafariHistoryServiceAgent
`;

/** Captured `launchctl print pid/74193` excerpt (no top-level label = line). */
const MACOS_PRINT_DIVOT = `pid/74193 = {
\tcreator = divot[74193]
\tcreator euid = 501
\tservices = {
\t       0   (pe)  com.apple.SetStoreUpdateService
\t}
}`;

const MACOS_PRINT_LAUNCHCTL = `pid/48210 = {
\tcreator = launchctl[12345]
\tcreator euid = 501
}`;

const LINUX_SYSTEMD_SAMPLE = `● com.example.repoos-serve.service - RepoOS
   Loaded: loaded (/home/nick/.config/systemd/user/com.example.repoos-serve.service; enabled; preset: enabled)
   Active: active (running) since Wed 2026-11-11 10:00:00 UTC; 1h ago
 Main PID: 48210 (repoos)
`;

describe("parseLaunchctlListForPid", () => {
  it("maps a running pid to its label", () => {
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 48210)).toBe("org.repoos.serve.kamrai");
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 74193)).toBe(
      "application.local.divot.preview.307783174.307783179",
    );
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 99999)).toBeNull();
  });
});

describe("parseLaunchctlPrintCreator", () => {
  it("reads the creator process name", () => {
    expect(parseLaunchctlPrintCreator(MACOS_PRINT_DIVOT)).toBe("divot");
    expect(parseLaunchctlPrintCreator(MACOS_PRINT_LAUNCHCTL)).toBe("launchctl");
  });
});

describe("parseSystemdPidStatus", () => {
  it("parses user units and rejects user@", () => {
    const info = parseSystemdPidStatus(LINUX_SYSTEMD_SAMPLE);
    expect(info?.job).toBe("com.example.repoos-serve");
    expect(info?.manualCommand).toContain("systemctl --user");
    expect(parseSystemdPidStatus("● user@501.service - User Manager")).toBeNull();
  });
});

describe("launchctlKickstartCommand", () => {
  it("prefers gui domain when print succeeds", () => {
    const execFile = vi.fn().mockReturnValue("ok");
    const cmd = launchctlKickstartCommand("org.repoos.serve.kamrai", execFile as never);
    expect(cmd).toMatch(/gui\/\d+\/org\.repoos\.serve\.kamrai/);
  });

  it("falls back to system domain when gui print fails", () => {
    const execFile = vi.fn().mockImplementation(() => {
      throw new Error("not found");
    });
    expect(launchctlKickstartCommand("org.repoos.serve.kamrai", execFile as never)).toBe(
      "launchctl kickstart -k system/org.repoos.serve.kamrai",
    );
  });
});

describe("detectSupervisor", () => {
  it("classifies external launchd jobs from launchctl list", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return MACOS_LIST_SAMPLE;
      if (cmd === "launchctl" && args[0] === "print" && args[1] === "pid/48210")
        return MACOS_PRINT_LAUNCHCTL;
      if (cmd === "launchctl" && String(args[1]).startsWith("gui/")) return "ok";
      throw new Error("unexpected");
    });
    const r = detectSupervisor(48210, execFile as never);
    expect(r.kind).toBe("external");
    if (r.kind === "external") {
      expect(r.info.job).toBe("org.repoos.serve.kamrai");
    }
  });

  it("returns uncertain when creator is launchctl but list has no row", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return "PID\tStatus\tLabel\n";
      if (cmd === "launchctl" && args[0] === "print") return MACOS_PRINT_LAUNCHCTL;
      if (cmd === "ps") return "9999\n";
      throw new Error("unexpected");
    });
    const r = detectSupervisor(48210, execFile as never);
    expect(r.kind).toBe("uncertain");
  });
});

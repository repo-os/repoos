import { describe, expect, it, vi } from "vitest";
import {
  detectSupervisor,
  launchctlRestartCommand,
  launchdDomainForUid,
  parseLaunchctlListForPid,
  parseLaunchctlPrintCreator,
  parseSystemdPidStatus,
} from "./supervisor-detect.js";

/**
 * Captured verbatim from macOS `launchctl list` (tab-separated). Includes the
 * real RepoOS-managed unit for this checkout (`com.repoos.serve.repoos-c4114ede`),
 * a hand-written external daemon (`org.repoos.serve.kamrai`), and Apple agents.
 */
const MACOS_LIST_SAMPLE = `PID\tStatus\tLabel
74193\t0\tapplication.local.divot.preview.307783174.307783179
83082\t0\tcom.repoos.serve.repoos-c4114ede
48210\t0\torg.repoos.serve.kamrai
90050\t-9\tcom.apple.cloudphotod
714\t0\tcom.apple.Finder
-\t0\tcom.apple.SafariHistoryServiceAgent
`;

/** Captured `launchctl print pid/714` excerpt — note: NO `label =` line. */
const MACOS_PRINT_FINDER = `pid/714 = {
	type = pid
	handle = 714
	active count = 1
	on-demand count = 1
	creator = Finder[714]
	creator euid = 501
	uniqueid = 11137548
	security context = {
		uid = 501
		asid = 100021
	}
}`;

/**
 * Captured `launchctl print pid/99999999` — launchd answers 0 for a pid that
 * does not exist, which is why a "print succeeded" check cannot be trusted.
 */
const MACOS_PRINT_NONEXISTENT = `pid/99999999 = {
	type = pid
	handle = 99999999
	active count = 1
	on-demand count = 1
}`;

/** Captured `systemctl status <pid>` excerpt (Debian bookworm). */
const LINUX_SYSTEMD_SAMPLE = `● com.example.repoos-serve.service - RepoOS
   Loaded: loaded (/home/nick/.config/systemd/user/com.example.repoos-serve.service; enabled; preset: enabled)
   Active: active (running) since Wed 2026-11-11 10:00:00 UTC; 1h ago
 Main PID: 48210 (repoos)
`;

describe("parseLaunchctlListForPid", () => {
  it("maps a running pid to its label from real `launchctl list` output", () => {
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 83082)).toBe(
      "com.repoos.serve.repoos-c4114ede",
    );
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 48210)).toBe("org.repoos.serve.kamrai");
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 714)).toBe("com.apple.Finder");
  });

  it("returns null for a pid with no running row", () => {
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 99999)).toBeNull();
  });

  it("returns null for a loaded-but-not-running job (pid '-')", () => {
    // `-` marks a loaded job that is not running; it never matches a real pid.
    expect(parseLaunchctlListForPid(MACOS_LIST_SAMPLE, 0)).toBeNull();
  });
});

describe("parseLaunchctlPrintCreator", () => {
  it("reads the creator process name from real print output", () => {
    expect(parseLaunchctlPrintCreator(MACOS_PRINT_FINDER)).toBe("Finder");
    // A nonexistent pid still prints a well-formed block with no creator.
    expect(parseLaunchctlPrintCreator(MACOS_PRINT_NONEXISTENT)).toBeNull();
  });
});

describe("launchdDomainForUid", () => {
  it("uses gui/<uid> for a user job and system for root/unknown", () => {
    expect(launchdDomainForUid(501)).toBe("gui/501");
    expect(launchdDomainForUid(0)).toBe("system");
    expect(launchdDomainForUid(null)).toBe("system");
  });
});

describe("launchctlRestartCommand", () => {
  it("names gui/<uid> when the user-domain print succeeds", () => {
    const execFile = vi.fn().mockReturnValue("ok");
    const cmd = launchctlRestartCommand("org.repoos.serve.kamrai", 501, execFile as never);
    expect(cmd).toBe("launchctl kickstart -k gui/501/org.repoos.serve.kamrai");
  });

  it("falls back to the system domain for a root-owned job", () => {
    const execFile = vi.fn().mockImplementation(() => {
      throw new Error("not found");
    });
    expect(launchctlRestartCommand("org.repoos.serve.kamrai", 0, execFile as never)).toBe(
      "launchctl kickstart -k system/org.repoos.serve.kamrai",
    );
  });
});

describe("parseSystemdPidStatus", () => {
  it("parses a user unit and rejects the user manager and non-services", () => {
    const info = parseSystemdPidStatus(LINUX_SYSTEMD_SAMPLE);
    expect(info?.job).toBe("com.example.repoos-serve");
    expect(info?.manualCommand).toContain("systemctl --user");
    expect(parseSystemdPidStatus("● user@501.service - User Manager")).toBeNull();
    expect(parseSystemdPidStatus("● foo.slice - Slice")).toBeNull();
  });
});

describe("detectSupervisor", () => {
  it("classifies an externally-managed launchd job from the real list output", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return MACOS_LIST_SAMPLE;
      if (cmd === "launchctl" && String(args[1]).startsWith("gui/")) return "ok";
      if (cmd === "ps" && args.includes("uid=")) return "501\n";
      throw new Error("unexpected");
    });
    const r = detectSupervisor(48210, execFile as never);
    expect(r.kind).toBe("external");
    if (r.kind === "external") {
      expect(r.info.job).toBe("org.repoos.serve.kamrai");
      expect(r.info.platform).toBe("launchd");
      expect(r.info.manualCommand).toBe("launchctl kickstart -k gui/501/org.repoos.serve.kamrai");
    }
  });

  it("treats a RepoOS-managed label as its own service, not an external supervisor", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return MACOS_LIST_SAMPLE;
      throw new Error("unexpected");
    });
    const r = detectSupervisor(83082, execFile as never);
    expect(r.kind).toBe("none");
  });

  it("is uncertain (not hand-run) when a launchd-parented pid has no list row", () => {
    // Real launchctl `print` exits 0 for any pid, so we cannot use it to prove
    // supervision; a pid 1 parent with no label is reported as uncertain.
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return "PID\tStatus\tLabel\n";
      if (cmd === "ps" && args.includes("ppid=")) return "1\n";
      throw new Error("unexpected");
    });
    const r = detectSupervisor(48210, execFile as never);
    expect(r.kind).toBe("uncertain");
  });

  it("is uncertain when launchctl list itself fails", () => {
    const execFile = vi.fn().mockImplementation(() => {
      throw new Error("launchctl: Operation not permitted");
    });
    const r = detectSupervisor(48210, execFile as never);
    expect(r.kind).toBe("uncertain");
  });

  it("classifies a plain shell-parented serve as hand-run", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return "PID\tStatus\tLabel\n";
      if (cmd === "ps" && args.includes("ppid=")) return "9001\n";
      if (cmd === "ps" && args.includes("command=")) return "-zsh\n";
      throw new Error("unexpected");
    });
    const r = detectSupervisor(48210, execFile as never);
    expect(r.kind).toBe("none");
  });
});

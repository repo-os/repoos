import { describe, expect, it, vi } from "vitest";
import {
  detectSupervisor,
  detectLinuxSupervisor,
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

  it("uses plain systemctl for a system unit and infers the unit from a pid status", () => {
    // Captured `systemctl status <pid>` shape for a system service: the dot is
    // the unit marker, no /run/user path, so restart is the system manager's.
    const captured = `● my-serve.service - My Serve
     Loaded: loaded (/etc/systemd/system/my-serve.service; enabled; preset: enabled)
     Active: active (running) since Wed 2026-11-11 10:00:00 UTC; 1h ago
   Main PID: 48210 (repoos)
`;
    const info = parseSystemdPidStatus(captured);
    expect(info?.job).toBe("my-serve");
    expect(info?.manualCommand).toBe("systemctl restart my-serve.service");
  });

  it("rejects the per-user manager unit even when a Main PID is present", () => {
    expect(parseSystemdPidStatus("● user@501.service\n   Main PID: 12 (systemd)")).toBeNull();
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

  it("finds a system-domain LaunchDaemon that non-root `launchctl list` omits (Kamrai)", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list")
        return "PID\tStatus\tLabel\n714\t0\tcom.apple.Finder\n";
      if (cmd === "launchctl" && args[0] === "print" && args[1] === "system") {
        return "system = {\n\tservices = {\n\t\t48210\t0\torg.repoos.serve.kamrai\n\t\t-\t0\tcom.apple.foo\n\t}\n}\n";
      }
      if (cmd === "ps" && args.includes("uid=")) return "0\n";
      throw new Error("unexpected");
    });
    const r = detectSupervisor(48210, execFile as never);
    expect(r.kind).toBe("external");
    if (r.kind === "external") expect(r.info.job).toBe("org.repoos.serve.kamrai");
  });

  it("treats a RepoOS-managed label as its own service, not an external supervisor", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return MACOS_LIST_SAMPLE;
      throw new Error("unexpected");
    });
    const r = detectSupervisor(83082, execFile as never);
    expect(r.kind).toBe("managed");
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

  it("treats a pid-1-parented nohup server as hand-run after launchd domains were checked", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return "PID\tStatus\tLabel\n";
      if (cmd === "launchctl" && args[0] === "print") return "services = {}\n";
      if (cmd === "ps" && args.includes("uid=")) return "501\n";
      if (cmd === "ps" && args.includes("ppid=")) return "1\n";
      throw new Error("unexpected");
    });
    expect(detectSupervisor(48210, execFile as never)).toEqual({ kind: "none" });
  });

  it("is uncertain (not hand-run) when the pid's parent cannot be read", () => {
    // If `launchctl list` has no row AND we cannot read the parent, we cannot
    // rule out a supervisor, so refuse rather than classify as hand-run and
    // SIGTERM a supervised server (#1091 review pass 4).
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "launchctl" && args[0] === "list") return "PID\tStatus\tLabel\n";
      if (cmd === "launchctl" && args[0] === "print") throw new Error("not permitted");
      if (cmd === "ps" && args.includes("ppid=")) throw new Error("ps failed");
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

describe("detectLinuxSupervisor", () => {
  it("finds a renamed RepoOS server from its user service cgroup", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "systemctl") throw new Error("unit lookup unavailable");
      if (cmd === "cat" && args[0] === "/proc/48210/cgroup")
        return "0::/user.slice/user-1000.slice/user@1000.service/app.slice/com.repoos.serve.tuk-driver-aaa442e5.service\n";
      throw new Error(`unexpected ${cmd} ${args.join(" ")}`);
    });

    expect(detectLinuxSupervisor(48210, execFile as never)).toEqual({
      kind: "managed",
      job: "com.repoos.serve.tuk-driver-aaa442e5",
      info: {
        platform: "systemd",
        job: "com.repoos.serve.tuk-driver-aaa442e5",
        manualCommand: "systemctl --user restart com.repoos.serve.tuk-driver-aaa442e5.service",
      },
    });
  });

  it("uses the external unit in the cgroup after skipping the user manager unit", () => {
    const execFile = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "systemctl") throw new Error("unit lookup unavailable");
      if (cmd === "cat")
        return "0::/user.slice/user-1000.slice/user@1000.service/app.slice/other.service\n";
      throw new Error("unexpected command");
    });

    expect(detectLinuxSupervisor(48210, execFile as never)).toMatchObject({
      kind: "external",
      info: {
        platform: "systemd",
        job: "other",
        manualCommand: "systemctl --user restart other.service",
      },
    });
  });

  it("recognizes a renamed managed server from its systemd parent when cgroup lookup fails", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "systemctl") throw new Error("unit lookup unavailable");
      if (cmd === "cat") throw new Error("cgroup unavailable");
      if (cmd === "ps" && args.includes("ppid=")) return "1111\n";
      if (cmd === "ps" && args.includes("command="))
        return "/lib/systemd/systemd --user com.repoos.serve.tuk-driver-aaa442e5.service\n";
      throw new Error(`unexpected ${cmd} ${args.join(" ")}`);
    });

    expect(detectLinuxSupervisor(48210, execFile as never)).toEqual({
      kind: "managed",
      job: "com.repoos.serve.tuk-driver-aaa442e5",
      info: {
        platform: "systemd",
        job: "com.repoos.serve.tuk-driver-aaa442e5",
        manualCommand: "systemctl --user restart com.repoos.serve.tuk-driver-aaa442e5.service",
      },
    });
  });

  it("does not mistake a shell-parented hand-run server for a systemd unit", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "systemctl") throw new Error("not managed");
      if (cmd === "cat") throw new Error("no cgroup data");
      if (cmd === "ps" && args.includes("ppid=")) return "9001\n";
      if (cmd === "ps" && args.includes("command=")) return "-zsh\n";
      throw new Error(`unexpected ${cmd} ${args.join(" ")}`);
    });

    expect(detectLinuxSupervisor(48210, execFile as never)).toEqual({ kind: "none" });
  });

  it("returns uncertain when a systemd parent is visible but the unit is unavailable", () => {
    const execFile = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "systemctl") throw new Error("unit lookup unavailable");
      if (cmd === "cat") throw new Error("cgroup hidden");
      if (cmd === "ps" && args.includes("ppid=")) return "1\n";
      if (cmd === "ps" && args.includes("command=")) return "/lib/systemd/systemd --user\n";
      throw new Error(`unexpected ${cmd} ${args.join(" ")}`);
    });

    expect(detectLinuxSupervisor(48210, execFile as never).kind).toBe("uncertain");
  });
});

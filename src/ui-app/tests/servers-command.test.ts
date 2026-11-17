import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectTailnetServers,
  parseTailnetPeers,
  remoteFailureReason,
  remoteShellCommand,
  remoteShellScript,
  shellQuote,
  tailnetFallbackNotice,
  cmdServers,
  serversSshArgs,
} from "../../commands/servers.js";
import * as registry from "../../core/server-registry.js";

describe("repoos servers --tailscale", () => {
  it("parses online peers and excludes self and offline peers", () => {
    expect(
      parseTailnetPeers(
        JSON.stringify({
          Self: { HostName: "laptop" },
          Peer: {
            a: { HostName: "bee", Online: true },
            b: { DNSName: "thinkpad.tailnet.ts.net.", Online: true },
            c: { HostName: "sleeping", Online: false },
            d: { HostName: "laptop", Online: true },
          },
        }),
      ),
    ).toEqual(["bee", "thinkpad"]);
  });

  it("uses MagicDNS identities when HostNames are duplicated or contain display punctuation", () => {
    expect(
      parseTailnetPeers(
        JSON.stringify({
          Self: { HostName: "omarchy", DNSName: "air.tailc0c173.ts.net." },
          Peer: {
            a: {
              HostName: "omarchy",
              DNSName: "bee.tailc0c173.ts.net.",
              OS: "linux",
              Online: true,
            },
            b: {
              HostName: "omarchy",
              DNSName: "thinkpad.tailc0c173.ts.net.",
              OS: "linux",
              Online: true,
            },
            c: {
              HostName: "Peck’s Mac mini",
              DNSName: "mini.tailc0c173.ts.net.",
              OS: "macOS",
              Online: true,
            },
            d: { HostName: "Peck’s Mac mini", OS: "macOS", Online: true },
          },
        }),
      ),
    ).toEqual(["bee", "thinkpad", "mini"]);
  });

  it("skips unsupported mobile peers instead of reporting misleading SSH failures", async () => {
    const remoteExec = vi.fn(async () => JSON.stringify({ servers: [] }));
    const result = await collectTailnetServers([], {
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: {
            phone: {
              HostName: "Nothing Phone (3a)",
              DNSName: "nothing-phone.tailc0c173.ts.net.",
              OS: "android",
              Online: true,
            },
            tablet: {
              HostName: "iPad",
              DNSName: "ipad.tailc0c173.ts.net.",
              OS: "iOS",
              Online: true,
            },
            bee: {
              HostName: "omarchy",
              DNSName: "bee.tailc0c173.ts.net.",
              OS: "linux",
              Online: true,
            },
          },
        }),
      remoteExec,
    });

    expect(result.servers).toEqual([]);
    expect(remoteExec).toHaveBeenCalledTimes(1);
    expect(remoteExec).toHaveBeenCalledWith("bee", "root", 8_000, "repoos servers --json");
  });

  it("probes duplicate-HostName peers individually by MagicDNS name", async () => {
    const remoteExec = vi.fn(
      async (host: string, _user: string, _timeout: number, command?: string) => {
        if (command === "tailscale serve status --json") return "{}";
        return JSON.stringify({ servers: [{ port: 7499, projectName: `${host}-project` }] });
      },
    );
    const result = await collectTailnetServers([], {
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: {
            a: {
              HostName: "omarchy",
              DNSName: "bee.tailc0c173.ts.net.",
              OS: "linux",
              Online: true,
            },
            b: {
              HostName: "omarchy",
              DNSName: "thinkpad.tailc0c173.ts.net.",
              OS: "linux",
              Online: true,
            },
            c: {
              HostName: "Peck’s Mac mini",
              DNSName: "mini.tailc0c173.ts.net.",
              OS: "macOS",
              Online: true,
            },
          },
        }),
      annotateUrls: false,
      remoteExec,
      httpDiscovery: async () => null,
    });

    expect(result.servers).toEqual([
      { host: "bee", displayName: "omarchy", port: 7499, projectName: "bee-project" },
      { host: "thinkpad", displayName: "omarchy", port: 7499, projectName: "thinkpad-project" },
      {
        host: "mini",
        displayName: "Peck’s Mac mini",
        port: 7499,
        projectName: "mini-project",
      },
    ]);
    const probed = remoteExec.mock.calls
      .filter(([, , , command]) => command === "repoos servers --json")
      .map(([host]) => host);
    expect(probed).toEqual(["bee", "thinkpad", "mini"]);
    expect(probed).not.toContain("omarchy");
    expect(probed).not.toContain("Peck’s Mac mini");
  });

  it("lists local and remote entries with hosts, continuing after a timed out peer", async () => {
    const remoteExec = vi.fn(async (host: string, _user: string) => {
      if (host === "slow") throw new Error("Command timed out");
      return JSON.stringify({ servers: [{ port: 7171, projectName: "remote", valid: true }] });
    });
    const result = await collectTailnetServers([{ host: "local", port: 7000 }], {
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: {
            a: { HostName: "fast", Online: true },
            b: { HostName: "slow", Online: true },
          },
        }),
      remoteExec,
    });
    expect(result.tailscaleUnavailable).toBe(false);
    expect(result.source).toBe("tailscale");
    expect(result.servers).toEqual([
      { host: "local", port: 7000 },
      { port: 7171, projectName: "remote", valid: true, host: "fast" },
      { host: "slow", unreachable: true, reason: "timed out" },
    ]);
    expect(remoteExec).toHaveBeenCalledTimes(2);
    expect(remoteExec).toHaveBeenCalledWith("fast", "root", 8_000, "repoos servers --json");
  });

  it("falls back to configured hosts when the Tailscale CLI is unavailable", async () => {
    const remoteExec = vi.fn(async () => JSON.stringify({ servers: [{ port: 7499 }] }));
    const result = await collectTailnetServers([], {
      tailscaleStatus: async () => {
        throw new Error("tailscale: not found");
      },
      configuredHosts: ["bee"],
      remoteExec,
    });
    expect(result.tailscaleUnavailable).toBe(true);
    expect(result.source).toBe("configured-hosts");
    expect(result.servers).toEqual([{ port: 7499, host: "bee" }]);
    expect(remoteExec).toHaveBeenCalledWith("bee", "root", 8_000, "repoos servers --json");
  });

  it("reports local-only when the Tailscale CLI and the configured pool are both absent", async () => {
    const remoteExec = vi.fn(async () => JSON.stringify({ servers: [] }));
    const result = await collectTailnetServers([{ host: "local", port: 7171 }], {
      tailscaleStatus: async () => {
        throw new Error("tailscale: not found");
      },
      configuredHosts: [],
      remoteExec,
    });
    expect(result.tailscaleUnavailable).toBe(true);
    expect(result.source).toBe("local-only");
    expect(result.servers).toEqual([{ host: "local", port: 7171 }]);
    expect(remoteExec).not.toHaveBeenCalled();
    expect(tailnetFallbackNotice([])).toMatch(/no remoteValidation\.tailscaleHosts configured/);
    expect(tailnetFallbackNotice(["bee", "thinkpad"])).toMatch(
      /using configured hosts \(bee, thinkpad\)/,
    );
  });

  it("uses configured per-host users and the global Tailscale user in SSH targets", async () => {
    const remoteExec = vi.fn(async () => JSON.stringify({ servers: [] }));
    const result = await collectTailnetServers([], {
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: {
            a: { HostName: "bee", Online: true },
            b: { HostName: "mini", Online: true },
          },
        }),
      remoteHosts: [{ host: "bee", user: "operator" }],
      remoteValidation: { tailscaleUser: "nick" },
      remoteExec,
    });
    expect(result.servers).toEqual([]);
    expect(remoteExec).toHaveBeenCalledWith("bee", "operator", 8_000, "repoos servers --json");
    expect(remoteExec).toHaveBeenCalledWith("mini", "nick", 8_000, "repoos servers --json");
    expect(serversSshArgs("bee", "operator", 4_000)).toEqual([
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=4",
      "operator@bee",
      remoteShellCommand("repoos servers --json"),
    ]);
  });

  it("runs the remote command through sh with a predictable PATH, not an interactive shell", () => {
    const args = serversSshArgs("bee", "operator", 4_000);
    const remote = args.at(-1) as string;
    expect(remote).toBe(
      "sh -c 'PATH=\"$HOME/.local/bin:$HOME/.bun/bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:$PATH\"; export PATH; repoos servers --json'",
    );
    // The destination and payload are separate argv, so a host/user value can
    // never become shell syntax; the payload is one quoted `sh -c` argument.
    expect(args.slice(-2)).toEqual(["operator@bee", remote]);
    expect(remote.startsWith("sh -c '")).toBe(true);
    expect(remote.endsWith("repoos servers --json'")).toBe(true);
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });

  it("finds repoos through the added PATH under sh, bash and zsh", () => {
    const home = mkdtempSync(join(tmpdir(), "repoos-remote-path-"));
    const bin = join(home, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    const fake = join(bin, "repoos");
    writeFileSync(fake, "#!/bin/sh\nprintf 'found:%s\\n' \"$1\"\n");
    chmodSync(fake, 0o755);
    try {
      const script = remoteShellScript("repoos probe");
      const shells = ["sh", "bash", "zsh"].filter((shell) => {
        try {
          execFileSync("sh", ["-c", `command -v ${shell}`], { stdio: "ignore" });
          return true;
        } catch {
          return false;
        }
      });
      // sh and bash are the POSIX/bourne pair every supported remote has;
      // zsh is checked where present. All read the deterministic PATH, not an
      // interactive startup file.
      expect(shells).toContain("sh");
      expect(shells).toContain("bash");
      for (const shell of shells) {
        const out = execFileSync(shell, ["-c", script], {
          env: { ...process.env, HOME: home },
          encoding: "utf8",
        });
        expect(out.trim()).toBe("found:probe");
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps command-not-found, auth and connection causes distinct from real timeouts", async () => {
    const commandNotFound = Object.assign(
      new Error(
        "Command failed: ssh -o BatchMode=yes -o ConnectTimeout=4 operator@bee sh -c 'repoos servers --json'",
      ),
      {
        code: 127,
        stderr: "bash: line 1: repoos: command not found\n",
        stdout: "",
      },
    );
    expect(remoteFailureReason(commandNotFound)).toMatch(/command not found: repoos/);
    expect(remoteFailureReason(commandNotFound)).not.toBe("timed out");

    const auth = Object.assign(new Error("Command failed: ssh ..."), {
      code: 255,
      stderr: "operator@bee: Permission denied (publickey).\n",
    });
    expect(remoteFailureReason(auth)).toMatch(/authentication failed/);
    expect(remoteFailureReason(auth)).not.toBe("timed out");

    // SSH forwards the remote command's stderr. A non-executable launcher or a
    // remote EACCES is NOT an SSH authentication failure.
    const remoteLauncherDenied = Object.assign(new Error("Command failed: ssh ..."), {
      code: 126,
      stderr: "sh: 1: /home/operator/.local/bin/repoos: Permission denied\n",
    });
    expect(remoteFailureReason(remoteLauncherDenied)).toMatch(/remote command permission denied/);
    expect(remoteFailureReason(remoteLauncherDenied)).not.toMatch(/authentication failed/);

    const remoteFileDenied = Object.assign(new Error("Command failed: ssh ..."), {
      code: 1,
      stderr: "EACCES: permission denied, open '/home/operator/.repoos/servers/7499.json'\n",
    });
    expect(remoteFailureReason(remoteFileDenied)).toMatch(/remote command permission denied/);
    expect(remoteFailureReason(remoteFileDenied)).not.toMatch(/authentication failed/);

    // The remote program may exit 255 and print its own "permission denied" /
    // "timeout" text. Those are remote-command causes, never SSH auth/timeout.
    const remoteOutput255 = Object.assign(new Error("Command failed: ssh ..."), {
      code: 255,
      stderr: "Error: request timeout while writing /tmp/repoos-cache\nPermission denied\n",
    });
    expect(remoteFailureReason(remoteOutput255)).not.toBe("timed out");
    expect(remoteFailureReason(remoteOutput255)).not.toMatch(/authentication failed/);
    expect(remoteFailureReason(remoteOutput255)).toMatch(/request timeout while writing/);

    // execFile's wrapper repeats the whole argv (including ConnectTimeout=4).
    // With no stderr it must not become a timeout or echo that argv.
    const bareExecFailure = Object.assign(
      new Error(
        "Command failed: ssh -o BatchMode=yes -o ConnectTimeout=4 operator@bee sh -c 'repoos servers --json'",
      ),
      { code: 255, stderr: "" },
    );
    expect(remoteFailureReason(bareExecFailure)).not.toBe("timed out");
    expect(remoteFailureReason(bareExecFailure)).not.toMatch(/ConnectTimeout/);
    expect(remoteFailureReason(bareExecFailure)).toBe("ssh command failed");

    const refused = Object.assign(new Error("Command failed: ssh ..."), {
      code: 255,
      stderr: "ssh: connect to host bee port 22: Connection refused\n",
    });
    expect(remoteFailureReason(refused)).toMatch(/connection refused/);
    expect(remoteFailureReason(refused)).not.toBe("timed out");

    // A real ssh-side timeout is still a timeout.
    const sshTimeout = Object.assign(new Error("Command failed: ssh ..."), {
      code: 255,
      stderr: "ssh: connect to host bee port 22: Connection timed out\n",
    });
    expect(remoteFailureReason(sshTimeout)).toBe("timed out");

    // A local execFile timeout (child killed) is a timeout even though its
    // message repeats ConnectTimeout=4 from the argv.
    const execTimeout = Object.assign(
      new Error("Command failed: ssh -o ConnectTimeout=4 operator@bee sh -c ..."),
      { killed: true, signal: "SIGTERM", code: null, stderr: "" },
    );
    expect(remoteFailureReason(execTimeout)).toBe("timed out");

    // execFile also kills the child at maxBuffer; that is an output limit, not
    // a network timeout (#1140 review).
    const tooMuch = Object.assign(new Error("Command failed: ssh ..."), {
      code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      killed: true,
      signal: "SIGTERM",
    });
    expect(remoteFailureReason(tooMuch)).toBe("remote output exceeded the 2 MiB limit");
    expect(remoteFailureReason(tooMuch)).not.toBe("timed out");
  });

  it("reports a command-not-found peer as its real cause, not a timeout, while keeping other hosts", async () => {
    const sshError = Object.assign(
      new Error(
        "Command failed: ssh -o BatchMode=yes -o ConnectTimeout=4 operator@bee sh -c 'repoos servers --json'",
      ),
      { code: 127, stderr: "zsh:1: command not found: repoos\n" },
    );
    const result = await collectTailnetServers([], {
      tailscaleStatus: async () => {
        throw new Error("tailscale: not found");
      },
      configuredHosts: ["bee", "thinkpad"],
      remoteExec: async (host) => {
        if (host === "bee") throw sshError;
        return JSON.stringify({ servers: [{ port: 7499, projectName: "thinkpad-project" }] });
      },
    });
    expect(result.servers).toEqual([
      { host: "bee", unreachable: true, reason: "command not found: repoos on the remote PATH" },
      { host: "thinkpad", port: 7499, projectName: "thinkpad-project" },
    ]);
  });

  it("prints the local-only fallback line through cmdServers", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-servers-text-"));
    const registryDir = mkdtempSync(join(tmpdir(), "repoos-servers-text-reg-"));
    writeFileSync(join(root, "repoos.toml"), "servePort = 7171\n");
    const priorRegistry = process.env.REPOOS_SERVERS_REGISTRY_DIR;
    process.env.REPOOS_SERVERS_REGISTRY_DIR = registryDir;
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      const collect: typeof collectTailnetServers = async (local) => ({
        servers: local,
        tailscaleUnavailable: true,
        source: "local-only",
      });
      await cmdServers(["--tailscale"], { root, collect });
      expect(logs.join("\n")).toMatch(/no remoteValidation\.tailscaleHosts configured/);
    } finally {
      log.mockRestore();
      if (priorRegistry === undefined) delete process.env.REPOOS_SERVERS_REGISTRY_DIR;
      else process.env.REPOOS_SERVERS_REGISTRY_DIR = priorRegistry;
      rmSync(root, { recursive: true, force: true });
      rmSync(registryDir, { recursive: true, force: true });
    }
  });

  it("names configured hosts in the cmdServers fallback line", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-servers-text-hosts-"));
    const registryDir = mkdtempSync(join(tmpdir(), "repoos-servers-text-hosts-reg-"));
    writeFileSync(
      join(root, "repoos.toml"),
      'servePort = 7171\n[[remoteValidation.tailscaleHosts]]\nhost = "bee"\n',
    );
    const priorRegistry = process.env.REPOOS_SERVERS_REGISTRY_DIR;
    process.env.REPOOS_SERVERS_REGISTRY_DIR = registryDir;
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      const collect: typeof collectTailnetServers = async (local) => ({
        servers: local,
        tailscaleUnavailable: true,
        source: "configured-hosts",
      });
      await cmdServers(["--tailscale"], { root, collect });
      expect(logs.join("\n")).toMatch(/using configured hosts \(bee\)/);
    } finally {
      log.mockRestore();
      if (priorRegistry === undefined) delete process.env.REPOOS_SERVERS_REGISTRY_DIR;
      else process.env.REPOOS_SERVERS_REGISTRY_DIR = priorRegistry;
      rmSync(root, { recursive: true, force: true });
      rmSync(registryDir, { recursive: true, force: true });
    }
  });

  it("refuses --prune --tailscale before touching the local or remote registries", async () => {
    const prune = vi.spyOn(registry, "pruneStaleServerRegistryEntries");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const local = vi.spyOn(registry, "listValidatedServerRegistry");
    try {
      await cmdServers(["--prune", "--tailscale"]);
      expect(prune).not.toHaveBeenCalled();
      expect(local).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("local-only"));
    } finally {
      prune.mockRestore();
      local.mockRestore();
      log.mockRestore();
    }
  });
});

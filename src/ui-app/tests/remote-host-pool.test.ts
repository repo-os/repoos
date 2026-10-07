/**
 * Remote validation host pool (#0521): dispatching jobs across several
 * tailnet hosts, capability routing (`runsOn`), per-host health with a
 * prerequisite probe, queue deadlines, and the host-side lock that makes a
 * standalone `repoos check` and the server share ONE per-host limit.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import { loadConfig } from "../../core/config.js";
import { getCheckStore } from "../../core/check-store.js";
import { resolveRemoteHosts, remoteHostUser, hostRunner } from "../../core/remote-hosts.js";
import { planJobCapabilities, resolveCheckPlan } from "../../core/check-plan.js";
import {
  CACHE_VOLUME_NAME,
  DEFAULT_HANG_IDLE_MINUTES,
  DEFAULT_HOST_LOCK_WAIT_SECS,
  HANG_IDLE_LOAD_THRESHOLD,
  HOST_LOCK_HEARTBEAT_SECS,
  HOST_LOCK_STALE_MINUTES,
  HOST_LOCK_TIMEOUT_EXIT,
  PREREQ_OK_TOKEN,
  RUNNER_SCRIPT_MIRROR_TOKEN,
  HostsUnavailableError,
  HangWatchdog,
  RemoteValidationRunner,
  TailscaleHostPool,
  TailscaleRunner,
  cacheVolumeForSlot,
  deadlineLockWaitSecs,
  detectHungRun,
  hangIdleThresholdMs,
  hostLoadCommand,
  hostLockShell,
  hostLockPriority,
  killContainerCommand,
  loadPerCpu,
  parseHostLockInspectOutput,
  parseRemoteServerStats,
  prereqProbeCommand,
  staleContainerCleanupCommand,
  staleBundlePruneCommand,
  remoteRunCleanupCommand,
  remoteRunHasGateExit,
  remoteRunPaths,
  validateContainerName,
  type RemoteExecDeps,
  type RemoteExecResult,
} from "../../server/remote-validation.js";
import {
  runRemotePreReviewGate,
  remoteJobCapabilities,
  checkEnvAfterRemoteGate,
  REPOOS_REMOTE_FALLBACK_DETAIL,
} from "../../server/pre-review-remote-gate.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// Never let an inherited REPOOS_CHECK_STORE_ROOT (a `repoos check` parent
// exports it for its own rows) redirect these fixtures into a live store.
delete process.env.REPOOS_CHECK_STORE_ROOT;

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-pool-"));
  dirs.push(root);
  return root;
}

const tick = (ms = 10): Promise<void> => new Promise((r) => setTimeout(r, ms));

function shippedValidateSh(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "scripts", "remote-runner", "validate.sh");
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    dir = join(dir, "..");
  }
  return "";
}

/** Bash fragment validate.sh runs after parsing args, before allocating WORK. */
function validatePreWorkStartup(script: string): string {
  const workLine = 'WORK="$(mktemp -d "$HOME/.repoos-validate.XXXXXX")"';
  const start = script.indexOf('docker ps -aq --filter "name=repoos-validate-"');
  const end = script.indexOf(workLine);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return script.slice(start, end).trim();
}

// ── config parsing ───────────────────────────────────────────────────────────

describe("host pool config parsing", () => {
  it("keeps a single `tailscaleHost` config working unchanged (#0520 compat)", () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      'workDir = "work"\n[remoteValidation]\nenabled = true\nprovider = "tailscale"\n' +
        'tailscaleHost = "mini"\ntailscaleUser = "peckjachowski"\n',
    );
    const cfg = loadConfig(root);
    expect(cfg.remoteValidation?.tailscaleHost).toBe("mini");
    expect(resolveRemoteHosts(cfg.remoteValidation)).toEqual([{ host: "mini" }]);
    expect(remoteHostUser(cfg.remoteValidation!, { host: "mini" })).toBe("peckjachowski");
  });

  it("reads this repo's own repoos.toml (flat dotted keys) without losing the host", () => {
    const cfg = loadConfig(join(__dirname, "..", "..", ".."));
    const hosts = resolveRemoteHosts(cfg.remoteValidation).map((h) => h.host);
    expect(hosts.length).toBeGreaterThan(0);
    // Exact pool membership is the developer's to change (the live file is a
    // real host list), but the shorthand host must survive the fold — losing
    // it is a parse regression, not a config choice (#0564 review).
    const shorthand = cfg.remoteValidation?.tailscaleHost?.trim();
    if (shorthand) {
      const host = shorthand.includes("@") ? shorthand.split("@").pop()! : shorthand;
      expect(hosts).toContain(host);
    }
  });

  it("folds flat dotted keys exactly, user@host shorthand included (0564 review)", () => {
    // Same shape this repo's own repoos.toml uses — top-level dotted keys, a
    // user@host shorthand, and a flat pool list that repeats the shorthand —
    // but synthesized so the exact expectation can't drift with the live
    // host list.
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      "remoteValidation.enabled = true\n" +
        'remoteValidation.provider = "tailscale"\n' +
        'remoteValidation.tailscaleHost = "peckjachowski@mini"\n' +
        'remoteValidation.tailscaleUser = "peckjachowski"\n' +
        'remoteValidation.tailscaleHosts = ["nick@bee", "peckjachowski@mini"]\n',
    );
    const cfg = loadConfig(root);
    expect(resolveRemoteHosts(cfg.remoteValidation).map((h) => h.host)).toEqual(["bee", "mini"]);
    expect(cfg.remoteValidation?.tailscaleHost).toBe("peckjachowski@mini");
  });

  it("parses Linux and macOS server stats output", () => {
    const linux = parseRemoteServerStats(
      "__UPTIME__\n 14:21:03 up 8 days, load average: 0.25, 0.40, 0.75\n" +
        "__CPU__\n8\n" +
        "__MEMORY__\nMem: 16000000000 6000000000 10000000000\n" +
        "__DISK__\nFilesystem 1024-blocks Used Available Capacity Mounted on\n" +
        "/dev/sda1 1000000 400000 600000 40% /\n",
      "2026-10-03T00:00:00.000Z",
    );
    expect(linux).toEqual({
      available: true,
      sampledAt: "2026-10-03T00:00:00.000Z",
      loadAverage: [0.25, 0.4, 0.75],
      cpuCount: 8,
      memoryTotalBytes: 16_000_000_000,
      memoryUsedBytes: 6_000_000_000,
      diskFreeBytes: 614_400_000,
    });

    const macos = parseRemoteServerStats(
      "__UPTIME__\n15:03  up 2 days,  load averages: 1.12 0.98 0.81\n" +
        "__CPU__\n10\n" +
        "__MEMORY__\nMach Virtual Memory Statistics: (page size of 16384 bytes)\n" +
        "Pages free: 1000.\nPages inactive: 2000.\nPages speculative: 100.\n" +
        "16384\n17179869184\n" +
        "__DISK__\nFilesystem 1024-blocks Used Available Capacity Mounted on\n" +
        "/dev/disk3s1 1000000 400000 600000 40% /System/Volumes/Data\n",
      "2026-10-03T00:00:00.000Z",
    );
    expect(macos).toEqual({
      available: true,
      sampledAt: "2026-10-03T00:00:00.000Z",
      loadAverage: [1.12, 0.98, 0.81],
      cpuCount: 10,
      memoryTotalBytes: 17_179_869_184,
      memoryUsedBytes: 17_179_869_184 - 3100 * 16384,
      diskFreeBytes: 614_400_000,
    });
    expect(parseRemoteServerStats("__UPTIME__\npermission denied\n__CPU__\n")).toMatchObject({
      available: false,
      detail: "No server statistics could be parsed.",
    });
  });

  it("pools a flat list plus [[…]] rows, folding the shorthand without duplicates", () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      '[remoteValidation]\nprovider = "tailscale"\n' +
        'tailscaleHost = "bee"\n' +
        'tailscaleHosts = ["bee", "linux2"]\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nuser = "nick"\nos = "macos"\nrunner = "native"\n' +
        'labels = ["apple-silicon"]\nmaxConcurrent = 2\n',
    );
    const cfg = loadConfig(root);
    expect(resolveRemoteHosts(cfg.remoteValidation)).toEqual([
      { host: "bee" },
      { host: "linux2" },
      {
        host: "mac1",
        user: "nick",
        os: "macos",
        runner: "native",
        labels: ["apple-silicon"],
        maxConcurrent: 2,
      },
    ]);
  });

  it("ignores an unrecognized `runner` value rather than dropping the row", () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      "[[remoteValidation.tailscaleHosts]]\n" + 'host = "bee"\nrunner = "podman"\n',
    );
    const cfg = loadConfig(root);
    // Falls back to the default (docker) rather than rejecting the whole row
    // over a typo'd runner value.
    expect(resolveRemoteHosts(cfg.remoteValidation)).toEqual([{ host: "bee" }]);
  });

  it("merges a rich row onto a host already listed flat (attrs win, no duplicate)", () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      'remoteValidation.tailscaleHosts = ["mac1", "bee"]\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nos = "macos"\n',
    );
    expect(resolveRemoteHosts(loadConfig(root).remoteValidation)).toEqual([
      { host: "mac1", os: "macos" },
      { host: "bee" },
    ]);
  });

  it('reads a hand-written string pool `tailscaleHosts = "bee, mac1"` as two hosts', () => {
    const root = tmpRoot();
    writeFileSync(join(root, "repoos.toml"), 'remoteValidation.tailscaleHosts = "bee, mac1"\n');
    expect(resolveRemoteHosts(loadConfig(root).remoteValidation)).toEqual([
      { host: "bee" },
      { host: "mac1" },
    ]);
  });

  it("parses user@host strings in a plain list into { host, user }", () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      'remoteValidation.tailscaleHosts = ["peckjachowski@mini", "nick@bee", "thinkpad"]\n' +
        'remoteValidation.tailscaleUser = "root"\n',
    );
    const cfg = loadConfig(root);
    expect(resolveRemoteHosts(cfg.remoteValidation)).toEqual([
      { host: "mini", user: "peckjachowski" },
      { host: "bee", user: "nick" },
      { host: "thinkpad" },
    ]);
    // user@host overrides the global tailscaleUser
    expect(remoteHostUser(cfg.remoteValidation!, { host: "mini", user: "peckjachowski" })).toBe(
      "peckjachowski",
    );
    // bare host falls back to tailscaleUser
    expect(remoteHostUser(cfg.remoteValidation!, { host: "thinkpad" })).toBe("root");
  });

  it("parses user@host in the single-host shorthand tailscaleHost", () => {
    const root = tmpRoot();
    writeFileSync(join(root, "repoos.toml"), 'remoteValidation.tailscaleHost = "nick@bee"\n');
    expect(resolveRemoteHosts(loadConfig(root).remoteValidation)).toEqual([
      { host: "bee", user: "nick" },
    ]);
  });
});

// ── capability derivation from the check plan ────────────────────────────────

describe("runsOn → job capabilities", () => {
  it("unions runsOn across build/tests steps only, ignoring profile scoping", () => {
    const plan = resolveCheckPlan({
      check: {
        steps: [
          { name: "build", kind: "build", runsOn: ["macos"] },
          { name: "tests", kind: "tests", runsOn: ["macos", "apple-silicon"] },
        ],
      },
    });
    expect(plan.warnings).toEqual([]);
    expect(planJobCapabilities(plan)).toEqual(["macos", "apple-silicon"]);
  });

  it("ignores runsOn on a step the remote host never runs (#0521 review)", () => {
    // validate.sh only ever runs `bun install && bun run build && bun run
    // test` — a custom command step (or any non-build/tests kind) never
    // executes remotely regardless of its own runsOn, so it must not force
    // an unrelated capability onto the remote job. A project with a
    // macOS-only LOCAL gate (say, an Xcode step) and only Linux remote hosts
    // must still be able to remote-validate its build+test.
    const plan = resolveCheckPlan({
      check: {
        steps: [
          { name: "build", kind: "build" },
          { name: "tests", kind: "tests" },
          { name: "xcode-gate", command: "xcodebuild", runsOn: ["macos"] },
        ],
      },
    });
    expect(plan.warnings).toEqual([]);
    expect(planJobCapabilities(plan)).toEqual([]);
  });

  it("is empty for a plan with no runsOn", () => {
    const plan = resolveCheckPlan({ check: { steps: [{ name: "noop", command: "true" }] } });
    expect(planJobCapabilities(plan)).toEqual([]);
  });

  it("remoteJobCapabilities is the one router every remote caller shares", () => {
    // server.ts's "Run test suite" endpoint and runRemotePreReviewGate both go
    // through this — a plan needing macos must reach a mac host either way.
    expect(
      remoteJobCapabilities({
        check: { steps: [{ name: "build", kind: "build", runsOn: ["macos"] }] },
      } as unknown as RepoOSConfig),
    ).toEqual(["macos"]);
    expect(remoteJobCapabilities({} as RepoOSConfig)).toEqual([]);
  });

  it("hands the capabilities to the runner via runRemotePreReviewGate", async () => {
    const root = tmpRoot();
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "T"], { cwd: root });
    writeFileSync(join(root, "f.txt"), "x");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: root });
    const validate = vi.fn().mockResolvedValue({ ok: true });
    const out = await runRemotePreReviewGate({
      config: {
        root,
        cacheDir: join(root, ".repoos"),
        workDir: "work",
        inputsDir: "inputs",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "ai",
        remoteValidation: { enabled: true, provider: "tailscale", tailscaleHost: "bee" },
        check: { steps: [{ name: "build", kind: "build", runsOn: ["macos"] }] },
      } as unknown as RepoOSConfig,
      remoteValidator: {
        validate,
        reconcile: vi.fn(),
        dispose: vi.fn(),
        logPath: () => "",
      },
      worktreePath: root,
      taskId: "0521",
      deadlineAt: Date.now() + 60_000,
    });
    expect(out).toEqual({ kind: "local-only", skipTests: true });
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ capabilities: ["macos"] }));
    expect(validate.mock.calls[0]![0].deadlineAt).toBeGreaterThan(Date.now());
  });
});

// ── dispatch across the pool ─────────────────────────────────────────────────

interface Fixture {
  runner: TailscaleRunner;
  exec: RemoteExecDeps;
  root: string;
  config: RepoOSConfig;
  /** Host → validation commands run on it (probe excluded). */
  cmds: Record<string, string[]>;
  /** Unblock the i-th pending run (in arrival order), optionally on a host. */
  release(host?: string): string;
  pending(): string[];
  peak(): number;
  /** Container names the hang watchdog killed (#0729). */
  killed: string[];
  /** Unblock a delayed hang-kill `runRemote` (#0735). */
  releaseKill(): void;
  /** Post-kill bundle/artifact cleanup SSH commands (#0739). */
  cleanupCmds: string[];
}

function poolFixture(opts: {
  hosts: Array<{
    host: string;
    os?: string;
    user?: string;
    maxConcurrent?: number;
    labels?: string[];
  }>;
  maxConcurrent?: number;
  unreachable?: string[];
  /** First validation run on this host drops its ssh connection (mid-run failure). */
  dropFirstRunOn?: string;
  /** Listed hosts stay unreachable after their drop: later probes keep failing. */
  stayDown?: string[];
  /** Every validation run on these hosts is SIGKILLed — runValidation's
   *  transient `timedOut` path (#0632). */
  timeoutRunOn?: string[];
  /** Every validation run on these hosts exits non-zero with ordinary output —
   *  a real red gate, `transient: false` (#0632). */
  failRunOn?: string[];
  retryOtherHosts?: boolean;
  healthRetryMs?: number;
  containerImage?: string;
  /** Simulated host-lock holders per host (#0705). */
  hostLockOccupancy?: Record<string, number>;
  /** Every validation run on these hosts streams nothing and stays pending
   *  forever — the hang watchdog (#0729) must kill it and retry elsewhere. */
  hungRunOn?: string[];
  /** Load average the hang watchdog's idle probe reports (#0729). 0 = idle. */
  fixedLoad?: number;
  /** Hang timings, shrunk so tests do not sleep for real (#0729). */
  hangIdleMinutes?: number;
  hangCheckIntervalMs?: number;
  loadSampleIntervalMs?: number;
  /** Hold the hang-kill SSH until `releaseKill()` so status can show in-flight hung. */
  delayKill?: boolean;
  /** Stall after printing a failed gate exit — must not be classified as hung (#0739). */
  gateExitStallOn?: string[];
  /** Hang-kill SSH never completes until `releaseKill()` (#0739 timeout test). */
  hangKillNeverCompletes?: boolean;
}): Fixture {
  const root = tmpRoot();
  const config = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "ai",
    cacheDir: ".repoos",
    remoteValidation: {
      enabled: true,
      provider: "tailscale",
      tailscaleHosts: opts.hosts,
      maxConcurrent: opts.maxConcurrent,
      containerImage: opts.containerImage,
      retryOtherHosts: opts.retryOtherHosts,
    },
  } as unknown as RepoOSConfig;

  const cmds: Record<string, string[]> = {};
  const pending: Array<{ host: string; resolve: () => void }> = [];
  const dropped = new Set<string>();
  const down = new Set<string>();
  const killed: string[] = [];
  const cleanupCmds: string[] = [];
  let killGate: { resolve: () => void } | null = null;
  let inFlight = 0;
  let peak = 0;
  const exec: RemoteExecDeps = {
    bundleRepo: vi.fn(async () => ({ ok: true })),
    uploadFile: vi.fn(async () => ({ ok: true })),
    downloadDir: vi.fn(async () => {}),
    runRemote: vi.fn(async (host, cmd, onChunk, timeoutMs, remoteOpts): Promise<RemoteExecResult> => {
      if (cmd.startsWith("rm -f ") && cmd.includes(".bundle") && cmd.includes("rm -rf")) {
        cleanupCmds.push(cmd);
        return { code: 0, output: "", timedOut: false };
      }
      // The hang watchdog's idle probe (#0729): report the configured load.
      if (cmd.includes("__UPTIME__") && cmd.includes("uptime")) {
        return {
          code: 0,
          output: `__UPTIME__\n 12:00  up 1 day, load averages: ${opts.fixedLoad ?? 0} ${opts.fixedLoad ?? 0} ${opts.fixedLoad ?? 0}\n__CPU__\n1\n`,
          timedOut: false,
        };
      }
      // The hang kill (#0729): record the named container and let the pending
      // run resolve as if docker rm -f ended it.
      if (cmd.startsWith("docker rm -f ") && cmd.includes("repoos-validate-")) {
        const name = cmd.split("'")[1] ?? cmd.split(" ").pop()!;
        killed.push(name);
        if (opts.hangKillNeverCompletes) {
          await tick(timeoutMs + 5);
          return { code: null, output: "", timedOut: true };
        }
        if (opts.delayKill) {
          await new Promise<void>((resolve) => {
            killGate = { resolve };
          });
        }
        return { code: 137, output: "", timedOut: false };
      }
      if (cmd.includes("__HOST_LOCK__")) {
        const n = opts.hostLockOccupancy?.[host.ip] ?? 0;
        let output = "__HOST_LOCK__\n";
        for (let i = 0; i < n; i++) {
          output += `hold\t${i}\t120\n{"taskId":"0694","phase":"self-check","worktree":"/wt/feat"}\n`;
        }
        return { code: 0, output, timedOut: false };
      }
      if (cmd.includes(PREREQ_OK_TOKEN)) {
        if (opts.unreachable?.includes(host.ip) || down.has(host.ip)) {
          return {
            code: 255,
            output: "ssh: connect to host 100.x.x.x port 22: Connection timed out",
            timedOut: false,
          };
        }
        return {
          code: 0,
          output: `prereq ok ${RUNNER_SCRIPT_MIRROR_TOKEN}=1 ${PREREQ_OK_TOKEN}`,
          timedOut: false,
        };
      }
      if (opts.timeoutRunOn?.includes(host.ip)) {
        (cmds[host.ip] ??= []).push(cmd);
        return { code: 0, output: "build running…", timedOut: true };
      }
      if (opts.failRunOn?.includes(host.ip)) {
        (cmds[host.ip] ??= []).push(cmd);
        return { code: 1, output: "1 test failed\nFAIL src/x.test.ts", timedOut: false };
      }
      if (opts.dropFirstRunOn === host.ip && !dropped.has(host.ip)) {
        // Mark the run as one that WILL drop its ssh connection when released
        // (a mid-run failure, not an instant one), so jobs can queue behind it.
        dropped.add(host.ip);
        if (opts.stayDown?.includes(host.ip)) down.add(host.ip);
        (cmds[host.ip] ??= []).push(cmd);
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => pending.push({ host: host.ip, resolve }));
        inFlight--;
        return { code: 255, output: "ssh: Connection reset by peer", timedOut: false };
      }
      if (opts.gateExitStallOn?.includes(host.ip)) {
        (cmds[host.ip] ??= []).push(cmd);
        onChunk?.("[validate] gate exit 1\n");
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => {
          const entry = { host: host.ip, resolve };
          pending.push(entry);
          remoteOpts?.registerAbort?.(() => {
            const i = pending.indexOf(entry);
            if (i !== -1) pending.splice(i, 1)[0]!.resolve();
          });
        });
        inFlight--;
        return { code: 1, output: "[validate] gate exit 1\n", timedOut: false };
      }
      (cmds[host.ip] ??= []).push(cmd);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => {
        const entry = { host: host.ip, resolve };
        pending.push(entry);
        remoteOpts?.registerAbort?.(() => {
          const i = pending.indexOf(entry);
          if (i !== -1) pending.splice(i, 1)[0]!.resolve();
        });
      });
      inFlight--;
      return { code: 0, output: "ok", timedOut: false };
    }),
    probeTcp: vi.fn(async () => true),
  };
  const runner = new TailscaleRunner(config, undefined, {
    exec,
    timings: {
      healthRetryMs: opts.healthRetryMs ?? 40,
      probeTimeoutMs: 1_000,
      hangIdleMinutes: opts.hangIdleMinutes,
      hangCheckIntervalMs: opts.hangCheckIntervalMs,
      loadSampleIntervalMs: opts.loadSampleIntervalMs,
    },
  });
  return {
    runner,
    exec,
    root,
    config,
    cmds,
    pending: () => pending.map((p) => p.host),
    peak: () => peak,
    killed,
    cleanupCmds,
    releaseKill() {
      killGate?.resolve();
      killGate = null;
    },
    release(host?: string) {
      const i = host ? pending.findIndex((p) => p.host === host) : 0;
      if (i === -1) throw new Error(`no pending run on ${host}`);
      const [entry] = pending.splice(i, 1);
      entry!.resolve();
      return entry!.host;
    },
  };
}

const opts = (taskId: string, extra: Record<string, unknown> = {}) => ({
  taskId,
  worktreePath: "/nonexistent",
  candidateSha: "abc123def456",
  ...extra,
});

describe("background host probing (#0683)", () => {
  it("probes every configured host when the runner starts, without dispatch", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }] });
    for (let i = 0; i < 20 && !f.runner.hostStatus()?.every((h) => h.probed); i++) {
      await tick();
    }
    const status = f.runner.hostStatus()!;
    expect(status.map((h) => [h.host, h.probed, h.healthy])).toEqual([
      ["a", true, true],
      ["b", true, true],
    ]);
    expect(f.pending()).toEqual([]);
  });

  it("surfaces Tailscale hints on unreachable hosts", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }], unreachable: ["a"] });
    for (let i = 0; i < 20 && !f.runner.hostStatus()?.[0]?.probed; i++) {
      await tick();
    }
    expect(f.runner.hostStatus()?.[0]).toMatchObject({
      probed: true,
      healthy: false,
      detail: expect.stringMatching(/Tailscale/i),
    });
  });

  it("records a fallback reason when every host fails probe and fallbackToLocal is on", async () => {
    const root = tmpRoot();
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "T"], { cwd: root });
    writeFileSync(join(root, "f.txt"), "x");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: root });
    const f = poolFixture({ hosts: [{ host: "a" }], unreachable: ["a"] });
    for (let i = 0; i < 20 && !f.runner.hostStatus()?.[0]?.probed; i++) {
      await tick();
    }
    const out = await runRemotePreReviewGate({
      config: {
        ...f.config,
        remoteValidation: {
          ...f.config.remoteValidation,
          fallbackToLocal: true,
        },
      } as RepoOSConfig,
      remoteValidator: f.runner,
      worktreePath: root,
      taskId: "0683",
      deadlineAt: Date.now() + 60_000,
    });
    expect(out).toMatchObject({ kind: "local-only", skipTests: false });
    if (out.kind !== "local-only") throw new Error("expected local-only");
    expect(out.detail).toContain("no usable remote host");
    expect(checkEnvAfterRemoteGate(out)[REPOOS_REMOTE_FALLBACK_DETAIL]).toContain(
      "no usable remote host",
    );
  });
});

describe("TailscaleRunner pool dispatch (#0521)", () => {
  it("skips a host after its SSH bundle upload fails", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }] });
    vi.mocked(f.exec.uploadFile).mockImplementation(async (host) =>
      host.ip === "a" ? { ok: false, detail: "ssh: Connection timed out" } : { ok: true },
    );

    const failed = await f.runner.validate(opts("0001"));
    expect(failed).toMatchObject({ ok: false, transient: true });
    expect(f.runner.hostStatus()?.find((host) => host.host === "a")).toMatchObject({
      healthy: false,
      detail: expect.stringContaining("Connection timed out"),
    });

    const next = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending()).toEqual(["b"]);
    f.release("b");
    expect(await next).toEqual({ ok: true, stage: "check" });
  });

  it("records a per-task infra event naming the host when an upload fails (#0568)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }] });
    vi.mocked(f.exec.uploadFile).mockImplementation(async (host) =>
      host.ip === "a" ? { ok: false, detail: "ssh: Connection timed out" } : { ok: true },
    );

    await f.runner.validate(opts("0001"));

    const ev = f.runner.remoteEvents("0001").find((e) => e.infra);
    expect(ev).toBeTruthy();
    expect(ev?.host).toBe("a");
    expect(ev?.message).toContain("upload");
  });

  it("records a queued event while a job waits for a host slot (#0568)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }] });
    const job1 = f.runner.validate(opts("0001"));
    await tick();
    const job2 = f.runner.validate(opts("0002"));
    await tick();

    expect(f.runner.remoteEvents("0002").some((e) => e.phase === "queued")).toBe(true);

    f.release("a");
    await tick();
    f.release("a");
    expect(await Promise.all([job1, job2])).toEqual([
      { ok: true, stage: "check" },
      { ok: true, stage: "check" },
    ]);
  });

  it("runs two jobs on two hosts and queues a third until one frees", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }] });
    const chunks3: string[] = [];
    const job1 = f.runner.validate(opts("0001"));
    const job2 = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending().sort()).toEqual(["a", "b"]);
    expect(f.peak()).toBe(2);

    const job3 = f.runner.validate(opts("0003", { onChunk: (c: string) => chunks3.push(c) }));
    await tick();
    expect(f.pending()).toHaveLength(2); // both hosts busy → job3 waits
    expect(chunks3.join("")).toContain("queued behind 2 other remote run(s)");

    const freed = f.release();
    await tick();
    // The freed slot went straight to the queued third job (FIFO, no dip).
    expect(f.pending()).toHaveLength(2);
    expect(f.pending()).toContain(freed);
    f.release();
    f.release();
    expect(await Promise.all([job1, job2, job3])).toEqual([
      { ok: true, stage: "check" },
      { ok: true, stage: "check" },
      { ok: true, stage: "check" },
    ]);
    expect(f.peak()).toBe(2); // never more than the two configured hosts
  });

  it("dispatches to a host added via applyConfig without reconstructing the runner (#0521 review)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }] });
    const job1 = f.runner.validate(opts("0001"));
    await tick();
    expect(f.pending()).toEqual(["a"]);
    expect(f.runner.hostStatus()!.map((h) => h.host)).toEqual(["a"]);

    f.config.remoteValidation!.tailscaleHosts = [{ host: "a" }, { host: "b" }];
    f.runner.applyConfig();
    expect(f.runner.hostStatus()!.map((h) => h.host)).toEqual(["a", "b"]);

    const job2 = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending().sort()).toEqual(["a", "b"]);
    expect(f.peak()).toBe(2);
    f.release();
    f.release();
    expect(await Promise.all([job1, job2])).toEqual([
      { ok: true, stage: "check" },
      { ok: true, stage: "check" },
    ]);
  });

  it("reorders configured hosts immediately and keeps state for an in-flight host", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }] });
    const first = f.runner.validate(opts("prior"));
    await tick();
    f.release("a");
    await first;

    const inFlight = f.runner.validate(opts("active"));
    await tick();
    expect(f.pending()).toEqual(["a"]);
    f.config.remoteValidation!.tailscaleHosts = [{ host: "b" }, { host: "a" }];
    f.runner.applyConfig();

    expect(f.runner.hostStatus()!.map((host) => host.host)).toEqual(["b", "a"]);
    expect(f.runner.hostStatus()![1]).toMatchObject({
      host: "a",
      inFlight: 1,
      probed: true,
      healthy: true,
      lastRun: { taskId: "prior", ok: true },
      activeRuns: [{ taskId: "active" }],
    });

    const next = f.runner.validate(opts("after"));
    await tick();
    expect(f.pending().sort()).toEqual(["a", "b"]);
    f.release("b");
    f.release("a");
    await Promise.all([inFlight, next]);
  });

  it("keeps an active host removed from config at the end until its run finishes", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }, { host: "c" }] });
    const jobs = ["a-run", "b-run", "c-run"].map((taskId) => f.runner.validate(opts(taskId)));
    await tick();
    expect(f.pending().sort()).toEqual(["a", "b", "c"]);

    f.config.remoteValidation!.tailscaleHosts = [{ host: "c" }, { host: "a" }];
    f.runner.applyConfig();
    expect(f.runner.hostStatus()!.map((host) => host.host)).toEqual(["c", "a", "b"]);
    expect(f.runner.hostStatus()!.at(-1)).toMatchObject({
      host: "b",
      inFlight: 1,
      activeRuns: [{ taskId: "b-run" }],
    });

    f.release("a");
    f.release("b");
    f.release("c");
    await Promise.all(jobs);
  });

  it("samples host stats directly without taking a run slot", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }] });
    const runRemote = vi.mocked(f.exec.runRemote).getMockImplementation()!;
    vi.mocked(f.exec.runRemote).mockImplementation(async (host, command, onChunk, timeoutMs) => {
      if (command.includes("__UPTIME__")) {
        return {
          code: 0,
          timedOut: false,
          output:
            "__UPTIME__\nload average: 0.10, 0.20, 0.30\n__CPU__\n4\n" +
            "__MEMORY__\nMem: 1000 500 500\n__DISK__\nFilesystem 1024-blocks Used Available Capacity Mounted on\n" +
            "/dev/sda 1000 500 500 50% /\n",
        };
      }
      return runRemote(host, command, onChunk, timeoutMs);
    });

    f.runner.refreshHostStats();
    await vi.waitFor(() =>
      expect(f.runner.hostStatus()![0]!.serverStats).toMatchObject({
        available: true,
        cpuCount: 4,
        memoryUsedBytes: 500,
        diskFreeBytes: 512_000,
      }),
    );
    expect(f.runner.hostStatus()![0]!.inFlight).toBe(0);
    expect(f.pending()).toEqual([]);
    await f.runner.dispose();
  });

  it("retries a newly added host whose first probe fails while work is queued", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }], healthRetryMs: 20 });
    const originalRunRemote = vi.mocked(f.exec.runRemote).getMockImplementation()!;
    let newHostProbes = 0;
    vi.mocked(f.exec.runRemote).mockImplementation(async (...args) => {
      if (args[0].ip === "b" && args[1].includes(PREREQ_OK_TOKEN) && ++newHostProbes === 1) {
        return { code: 255, output: "ssh: temporarily unavailable", timedOut: false };
      }
      return originalRunRemote(...args);
    });

    const first = f.runner.validate(opts("0001"));
    await tick();
    const queued = f.runner.validate(opts("0002")); // no caller deadline
    await tick();
    expect(f.pending()).toEqual(["a"]);

    f.config.remoteValidation!.tailscaleHosts = [{ host: "a" }, { host: "b" }];
    f.runner.applyConfig();
    await vi.waitFor(() => expect(f.pending()).toContain("b"), { timeout: 1_000 });
    expect(newHostProbes).toBe(2);

    f.release("b");
    expect((await queued).ok).toBe(true);
    f.release("a");
    expect((await first).ok).toBe(true);
  });

  it("settles a deadline-free waiter when a newly added host exhausts probe retries", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }], healthRetryMs: 10 });
    const originalRunRemote = vi.mocked(f.exec.runRemote).getMockImplementation()!;
    vi.mocked(f.exec.runRemote).mockImplementation(async (...args) =>
      args[0].ip === "b" && args[1].includes(PREREQ_OK_TOKEN)
        ? { code: 255, output: "ssh: unavailable", timedOut: false }
        : originalRunRemote(...args),
    );

    const first = f.runner.validate(opts("0001"));
    await tick();
    const queued = f.runner.validate(opts("0002")); // no caller deadline
    await tick();
    f.config.remoteValidation!.tailscaleHosts = [{ host: "b" }];
    f.runner.applyConfig(); // a stays busy but is no longer eligible for queued work

    const summary = await queued;
    expect(summary).toMatchObject({ ok: false, transient: true });
    expect(summary.detail).toContain("gave up after 10 failed probes");
    f.release("a");
    expect((await first).ok).toBe(true);
  }, 5_000);

  it("reprobes healthy hosts when the configured container image changes (#0521 review)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }], containerImage: "repoos-ci:v1" });
    const first = f.runner.validate(opts("0001"));
    await tick();
    f.release("a");
    await first;

    const calls = vi.mocked(f.exec.runRemote);
    const probesBefore = calls.mock.calls.filter(([, command]) =>
      command.includes(PREREQ_OK_TOKEN),
    );
    expect(probesBefore).toHaveLength(1);

    f.config.remoteValidation!.containerImage = "repoos-ci:v2";
    f.runner.applyConfig();
    const second = f.runner.validate(opts("0002"));
    await tick();
    const probesAfter = calls.mock.calls.filter(([, command]) => command.includes(PREREQ_OK_TOKEN));
    expect(probesAfter).toHaveLength(2);
    expect(probesAfter[1]![1]).toContain("repoos-ci:v2");
    f.release("a");
    expect(await second).toEqual({ ok: true, stage: "check" });
  });

  it("stops sending new jobs to a host removed from the live config", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }] });
    const job1 = f.runner.validate(opts("0001"));
    await tick();
    expect(f.pending()).toEqual(["a"]);

    f.config.remoteValidation!.tailscaleHosts = [{ host: "a" }];
    f.runner.applyConfig();
    expect(f.runner.hostStatus()!.map((h) => h.host)).toEqual(["a"]);

    const job2 = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending()).toEqual(["a"]);
    expect(f.cmds.b).toBeUndefined();
    f.release();
    await tick();
    expect(f.pending()).toEqual(["a"]);
    f.release();
    await Promise.all([job1, job2]);
  });

  it("records which host ran each job in its log, and wraps the run in the host lock", async () => {
    const f = poolFixture({ hosts: [{ host: "a", user: "bob" }, { host: "b" }] });
    const job = f.runner.validate(opts("logtask"));
    await tick();
    f.release();
    await job;
    const log = readFileSync(
      join(f.root, ".repoos", "logs", "remote-validation", "logtask.log"),
      "utf8",
    );
    expect(log).toContain("[runner bob@a]");
    const cmd = f.cmds["a"]![0]!;
    expect(cmd).toContain("LOCKROOT="); // cross-process host lock (#0521)
    expect(cmd).toContain("/opt/repoos/validate.sh");
    expect(cmd).toContain("~/.repoos-artifacts/logtask-"); // per-run artifacts arg
  });

  it("skips an unreachable host (probe fails, detail recorded) and lands jobs on the others", async () => {
    const f = poolFixture({
      hosts: [{ host: "dead" }, { host: "b" }, { host: "c" }],
      unreachable: ["dead"],
    });
    const job1 = f.runner.validate(opts("0001"));
    const job2 = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending().sort()).toEqual(["b", "c"]);
    expect(f.cmds.dead).toBeUndefined();

    const dead = f.runner.hostStatus()!.find((h) => h.host === "dead")!;
    expect(dead.probed).toBe(true);
    expect(dead.healthy).toBe(false);
    expect(dead.detail).toContain("Connection timed out");

    f.release();
    f.release();
    await Promise.all([job1, job2]);
    // …and the next job still avoids it.
    const job3 = f.runner.validate(opts("0003"));
    await tick();
    expect(f.pending()).toEqual(["b"]); // b and c are free again; dead stays skipped
    f.release();
    await job3;
    expect(f.cmds.dead).toBeUndefined();
  });

  it("fails a job clearly when every eligible host is misconfigured", async () => {
    const f = poolFixture({ hosts: [{ host: "broken" }], unreachable: ["broken"] });
    const summary = await f.runner.validate(opts("0001"));
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toContain("prerequisite check failed");
    expect(summary.detail).toContain("Connection timed out");
    expect(f.cmds.broken).toBeUndefined(); // reported instead of running a job
  });

  it("keeps a lone tailscaleHost config working exactly as before", async () => {
    const f = poolFixture({ hosts: [{ host: "mini", user: "peckjachowski" }] });
    const job = f.runner.validate(opts("0001"));
    await tick();
    expect(f.pending()).toEqual(["mini"]);
    const status = f.runner.hostStatus()!;
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({
      host: "mini",
      user: "peckjachowski",
      maxConcurrent: 1,
      inFlight: 1,
      probed: true,
      healthy: true,
    });
    f.release();
    expect(await job).toEqual({ ok: true, stage: "check" });
  });

  it("fails a queued run promptly when the pool is disposed (#0521 review)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }] });
    const first = f.runner.validate(opts("0001"));
    await tick();
    expect(f.pending()).toEqual(["a"]);
    const queued = f.runner.validate(opts("0002"));
    await tick();
    await f.runner.dispose();
    // Must resolve (transient failure), not hang forever awaiting a slot.
    const summary = await queued;
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toContain("shut down");
    f.release();
    expect((await first).ok).toBe(true);
  });

  it("counts each queued run against exactly one host in status (#0521 review)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }, { host: "b" }] });
    const job1 = f.runner.validate(opts("0001"));
    const job2 = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending().sort()).toEqual(["a", "b"]); // both hosts at their cap

    const job3 = f.runner.validate(opts("0003"));
    const job4 = f.runner.validate(opts("0004"));
    await tick();
    const status = f.runner.hostStatus()!;
    // Two real waiters: the old per-compatible-host count reported 2 on EACH
    // host (sum 4). Each waiter now belongs to the host dispatch would give it
    // next, so the column totals sum to the real queue length.
    expect(status.reduce((n, h) => n + h.queued, 0)).toBe(2);
    expect(Math.max(...status.map((h) => h.queued))).toBeLessThanOrEqual(2);

    // Drain: each release hands its slot to a queued job (FIFO), no hangs.
    for (let i = 0; i < 4; i++) {
      f.release();
      await tick();
    }
    const results = await Promise.all([job1, job2, job3, job4]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(f.peak()).toBe(2);
  });
});

// ── failover to another host (#0632) ─────────────────────────────────────────

describe("failover to another host (#0632)", () => {
  it("retries on the other host after a transient timeout and succeeds there", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }, { host: "b" }],
      retryOtherHosts: true,
      timeoutRunOn: ["a"],
    });

    const run = f.runner.validate(opts("0632"));
    // The first attempt (on a) is SIGKILLed immediately; the failover run on b
    // parks in the fixture until released.
    for (let i = 0; i < 100 && !f.pending().includes("b"); i++) await tick();
    expect(f.pending()).toEqual(["b"]);
    f.release("b");

    const res = await run;
    expect(res).toEqual({ ok: true, stage: "check" });
    // Exactly one attempt per host: the slow host timed out once, and the
    // retry ran on the OTHER host — the loaded host was never re-picked.
    expect(f.cmds.a).toHaveLength(1);
    expect(f.cmds.b).toHaveLength(1);
    const retry = f.runner
      .remoteEvents("0632")
      .find((e) => e.phase === "run" && e.level === "warn");
    expect(retry?.message).toContain("retrying on another host after transient failure on a");
    // The check-run history shows EACH attempt and which host ran it
    // (newest first).
    expect(
      getCheckStore(f.root)
        .list()
        .map((r) => [r.machine, r.outcome]),
    ).toEqual([
      ["b", "pass"],
      ["a", "fail"],
    ]);
  });

  it("returns the transient failure after every host has been tried, once each", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }, { host: "b" }],
      retryOtherHosts: true,
      timeoutRunOn: ["a", "b"],
    });

    const res = await f.runner.validate(opts("0632"));

    // All hosts failing falls through to the transient summary exactly as a
    // single-host failure would — fallbackToLocal/retryable, never a crash
    // and never a config error.
    expect(res).toMatchObject({ ok: false, transient: true });
    expect(String(res.detail)).toContain("timed out");
    expect(f.cmds.a).toHaveLength(1);
    expect(f.cmds.b).toHaveLength(1); // a host is never retried within one run
  });

  it("never retries a non-transient red gate", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }, { host: "b" }],
      retryOtherHosts: true,
      failRunOn: ["a"],
    });

    const res = await f.runner.validate(opts("0632"));

    expect(res).toMatchObject({ ok: false, transient: false });
    expect(f.cmds.a).toHaveLength(1);
    expect(f.cmds.b).toBeUndefined(); // the branch's fault — no failover
  });

  it("fails fast when a capability-filtered pool has no untried host left", async () => {
    // One eligible host (macos), one configured but useless for this job: the
    // retry must fail immediately with the last attempt's real summary, not
    // spin skipping the same host.
    const f = poolFixture({
      hosts: [
        { host: "a", os: "linux" },
        { host: "b", os: "macos" },
      ],
      retryOtherHosts: true,
      timeoutRunOn: ["b"],
    });

    const res = await f.runner.validate(opts("0632", { capabilities: ["macos"] }));

    expect(res).toMatchObject({ ok: false, transient: true });
    expect(String(res.detail)).toContain("timed out"); // the run's real failure, kept
    expect(f.cmds.b).toHaveLength(1);
    expect(f.cmds.a).toBeUndefined();
    // The spent-pool dispatch failure is recorded, machine null (newest first).
    const rows = getCheckStore(f.root).list();
    expect(rows.map((r) => [r.machine, r.outcome])).toEqual([
      [null, "fail"],
      ["b", "fail"],
    ]);
    expect(rows[0]!.detail).toContain("was already tried this run");
  });

  it("pool.acquire skips excluded hosts and fails fast when all eligible are spent", async () => {
    const exec: RemoteExecDeps = {
      bundleRepo: vi.fn(async () => ({ ok: true })),
      uploadFile: vi.fn(async () => ({ ok: true })),
      downloadDir: vi.fn(async () => {}),
      probeTcp: vi.fn(async () => true),
      runRemote: vi.fn(async (_host, cmd): Promise<RemoteExecResult> => {
        if (cmd.includes(PREREQ_OK_TOKEN)) {
          return {
            code: 0,
            output: `prereq ok ${RUNNER_SCRIPT_MIRROR_TOKEN}=1 ${PREREQ_OK_TOKEN}`,
            timedOut: false,
          };
        }
        if (cmd.includes("__HOST_LOCK__")) {
          return { code: 0, output: "__HOST_LOCK__\n", timedOut: false };
        }
        // Never finishes — no validation run should reach a host here.
        return new Promise<RemoteExecResult>(() => {});
      }),
    };
    const pool = new TailscaleHostPool(
      {
        enabled: true,
        provider: "tailscale",
        tailscaleHosts: [{ host: "a" }, { host: "b" }],
        maxConcurrent: 1,
      } as never,
      { exec },
    );

    // The excluded host is never leased, whichever one it is: config-order
    // tie-breaking must not resurrect it (the round-1 bug — the failed host
    // came back every time).
    const s1 = await pool.acquire([], { excludeHosts: ["a"] });
    expect(s1.host.host).toBe("b");
    s1.release();

    const s2 = await pool.acquire([], { excludeHosts: ["b"] });
    expect(s2.host.host).toBe("a");
    s2.release();

    // Every eligible host spent → immediate HostsUnavailableError (transient
    // infra), not a NoEligibleHost misconfiguration and not a hang.
    await expect(pool.acquire([], { excludeHosts: ["a", "b"] })).rejects.toBeInstanceOf(
      HostsUnavailableError,
    );
  });
});

// ── OS / label routing ───────────────────────────────────────────────────────

describe("capability routing (runsOn)", () => {
  it("never sends a macos job to a linux host", async () => {
    const f = poolFixture({ hosts: [{ host: "linux1" }, { host: "mac1", os: "macos" }] });
    const macJob = f.runner.validate(opts("0001", { capabilities: ["macos"] }));
    await tick();
    expect(f.pending()).toEqual(["mac1"]); // linux1 untouched
    expect(f.runner.hostStatus()!.find((h) => h.host === "linux1")!.inFlight).toBe(0);

    // An unrestricted job may take the linux host meanwhile.
    const anyJob = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending().sort()).toEqual(["linux1", "mac1"]);
    f.release("linux1");
    f.release("mac1");
    await Promise.all([macJob, anyJob]);
  });

  it("does not count incompatible waiters in the queued-behind count", async () => {
    const f = poolFixture({
      hosts: [
        { host: "linux1", os: "linux" },
        { host: "mac1", os: "macos" },
      ],
    });
    const macBusy = f.runner.validate(opts("0001", { capabilities: ["macos"] }));
    const linuxBusy = f.runner.validate(opts("0002", { capabilities: ["linux"] }));
    await tick();
    expect(f.pending().sort()).toEqual(["linux1", "mac1"]);

    const linuxChunks: string[] = [];
    const linuxQueued = f.runner.validate(
      opts("0003", { capabilities: ["linux"], onChunk: (c: string) => linuxChunks.push(c) }),
    );
    await tick();
    const macChunks: string[] = [];
    const macQueued = f.runner.validate(
      opts("0004", { capabilities: ["macos"], onChunk: (c: string) => macChunks.push(c) }),
    );
    await tick();
    expect(linuxChunks.join("")).toContain("queued behind 1 other remote run(s)");
    // mac1 is busy; the linux waiter ahead in FIFO does not compete for mac1.
    expect(macChunks.join("")).toContain("queued behind 1 other remote run(s)");
    expect(macChunks.join("")).not.toContain("queued behind 2 other remote run(s)");

    for (let i = 0; i < 4; i++) {
      f.release();
      await tick();
    }
    await Promise.all([macBusy, linuxBusy, linuxQueued, macQueued]);
  });

  it("waits with a clear log line when the only capable host is busy", async () => {
    const f = poolFixture({ hosts: [{ host: "linux1" }, { host: "mac1", os: "macos" }] });
    const first = f.runner.validate(opts("0001", { capabilities: ["macos"] }));
    await tick();
    const chunks: string[] = [];
    const second = f.runner.validate(
      opts("0002", { capabilities: ["macos"], onChunk: (c: string) => chunks.push(c) }),
    );
    await tick();
    expect(chunks.join("")).toContain("queued behind 1 other remote run(s)");
    expect(chunks.join("")).toContain("waiting for a host with macos");
    f.release("mac1");
    await tick();
    f.release("mac1");
    await Promise.all([first, second]);
    expect(f.cmds.mac1).toHaveLength(2);
    expect(f.cmds.linux1).toBeUndefined();
  });

  it("fails clearly when no configured host provides the capability — as a CONFIG error, not transient infra", async () => {
    const f = poolFixture({ hosts: [{ host: "linux1" }, { host: "linux2" }] });
    const summary = await f.runner.validate(opts("0001", { capabilities: ["windows"] }));
    expect(summary.ok).toBe(false);
    // Non-retryable (#0521 review): a misconfiguration must not be classified
    // as transient, or `fallbackToLocal` would silently run the full gate on
    // the wrong machine instead of failing clearly.
    expect(summary.transient).toBeFalsy();
    expect(summary.configError).toBe(true);
    expect(summary.detail).toContain("remote validation cannot run");
    expect(summary.detail).toContain("no remote host provides windows");
    expect(summary.detail).toContain("linux1");
    expect(summary.detail).toContain("[[remoteValidation.tailscaleHosts]]");
    expect(f.pending()).toHaveLength(0);
  });

  it("routes by a label as well as by os", async () => {
    const f = poolFixture({
      hosts: [{ host: "big" }, { host: "small", labels: ["tiny-runner"] }],
    });
    const job = f.runner.validate(opts("0001", { capabilities: ["tiny-runner"] }));
    await tick();
    expect(f.pending()).toEqual(["small"]);
    f.release("small");
    await job;
  });

  it("rejects a non-linux job on the Hetzner runner as a CONFIG error, with a routing hint", async () => {
    const root = tmpRoot();
    const runner = new RemoteValidationRunner({
      root,
      remoteValidation: { enabled: true, provider: "hetzner" },
    } as unknown as RepoOSConfig);
    const summary = await runner.validate(opts("0001", { capabilities: ["macos"] }));
    expect(summary.ok).toBe(false);
    // A routing mismatch is a misconfiguration, not transient infra (#0521
    // review): retrying or falling back locally cannot put the job on the
    // right OS.
    expect(summary.transient).toBeFalsy();
    expect(summary.configError).toBe(true);
    expect(summary.detail).toContain('provides only "linux"');
    expect(summary.detail).toContain("macos");
  });
});

describe("remote command quoting", () => {
  it("quotes containerImage as one shell assignment value", async () => {
    const f = poolFixture({
      hosts: [{ host: "linux1" }],
      containerImage: "safe; touch /tmp/pwned",
    });
    const job = f.runner.validate(opts("0001"));
    await tick();
    const runCommand = f.cmds.linux1?.[0];
    expect(runCommand).toContain("REPOOS_CI_IMAGE='safe; touch /tmp/pwned'");
    expect(runCommand).not.toContain("REPOOS_CI_IMAGE=safe; touch");
    f.release("linux1");
    await job;
  });
});

// ── deadlines ────────────────────────────────────────────────────────────────

describe("health-cooldown arrivals and recovery (#0521 review)", () => {
  it("an arrival during a cooldown waits for the armed retry instead of failing, then stays FIFO", async () => {
    const f = poolFixture({
      hosts: [{ host: "flaky" }],
      dropFirstRunOn: "flaky",
      healthRetryMs: 300,
    });
    const jobA = f.runner.validate(opts("0001"));
    await tick();
    expect(f.pending()).toEqual(["flaky"]);

    // C queues behind the still-running A.
    const jobC = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending()).toEqual(["flaky"]);

    // A's run drops its ssh connection → the host is marked unhealthy while C
    // (and its armed health retry) is queued.
    f.release("flaky");
    const resA = await jobA;
    expect(resA.ok).toBe(false);
    expect(resA.transient).toBe(true);
    expect(f.runner.hostStatus()![0]).toMatchObject({ probed: true, healthy: false });
    expect(f.runner.hostStatus()![0]!.detail).toContain("Connection reset");

    // D arrives while the host is inside its 30 s (here: 300 ms) cooldown. It
    // must WAIT for the pending recovery — not fail the way a bare arrival
    // would have while an earlier run's retry is armed.
    let dSettled = false;
    const jobD = f.runner.validate(opts("0003")).then((r) => {
      dSettled = true;
      return r;
    });
    await tick(50);
    expect(dSettled).toBe(false);

    // Cooldown elapses → re-probe succeeds → the slot goes to C (queued first);
    // D waits its turn instead of jumping the recovered slot.
    await tick(500);
    expect(dSettled).toBe(false);
    expect(f.pending()).toEqual(["flaky"]);
    f.release("flaky");
    await tick();
    expect(f.pending()).toEqual(["flaky"]);
    f.release("flaky");

    const [resC, resD] = await Promise.all([jobC, jobD]);
    expect(resC.ok).toBe(true);
    expect(resD.ok).toBe(true);
    expect(f.peak()).toBe(1); // the recovered slot never ran two suites at once
  }, 15_000);

  it("a FIRST arrival during a cooldown waits for recovery too, not just later ones (#0521 review)", async () => {
    const f = poolFixture({
      hosts: [{ host: "flaky" }],
      dropFirstRunOn: "flaky",
      healthRetryMs: 300,
    });
    const job1 = f.runner.validate(opts("0001"));
    await tick();
    f.release("flaky");
    expect((await job1).ok).toBe(false); // mid-run drop → cooldown starts
    expect(f.runner.hostStatus()![0]!.healthy).toBe(false);

    // Nobody is queued when this arrival lands — it must still wait out the
    // cooldown and re-probe instead of failing immediately (the old branch
    // only ran when an earlier waiter had armed the retry).
    let settled = false;
    const job2 = f.runner.validate(opts("0002")).then((r) => {
      settled = true;
      return r;
    });
    await tick(100);
    expect(settled).toBe(false); // inside the 300 ms cooldown — waiting, not failed
    await tick(500); // cooldown over → re-probe succeeds → dispatched
    expect(settled).toBe(false);
    expect(f.pending()).toEqual(["flaky"]);
    f.release("flaky");
    expect((await job2).ok).toBe(true);
  }, 15_000);

  it("fails a queued run when its only host exhausts health retries, instead of hanging (#0521 review)", async () => {
    const f = poolFixture({
      hosts: [{ host: "flaky" }],
      dropFirstRunOn: "flaky",
      stayDown: ["flaky"],
      healthRetryMs: 20,
    });
    const first = f.runner.validate(opts("0001"));
    await tick();
    expect(f.pending()).toEqual(["flaky"]);
    // No deadline on purpose: release (and close-out with
    // `closeOut.timeoutMs = 0`) pass none, so the retry cap itself has to
    // settle this waiter — before, the stopped retry chain left it awaiting a
    // slot forever.
    const queued = f.runner.validate(opts("0002"));
    await tick();
    f.release("flaky"); // mid-run ssh drop → marked unhealthy, probes now fail
    expect((await first).ok).toBe(false);
    expect(f.runner.hostStatus()![0]).toMatchObject({ probed: true, healthy: false });

    const summary = await queued; // settles once the 10-probe cap is hit
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toContain("no usable remote host");
    expect(summary.detail).toContain("gave up after 10 failed probes");
  }, 15_000);

  it("keeps a queued run waiting when another eligible host can still free up (#0521 review)", async () => {
    const f = poolFixture({
      hosts: [{ host: "flaky" }, { host: "steady" }],
      dropFirstRunOn: "flaky",
      stayDown: ["flaky"],
      healthRetryMs: 20,
    });
    const job1 = f.runner.validate(opts("0001"));
    const job2 = f.runner.validate(opts("0002"));
    await tick();
    expect(f.pending().sort()).toEqual(["flaky", "steady"]);

    let settled = false;
    const job3 = f.runner.validate(opts("0003")).then((r) => {
      settled = true;
      return r;
    });
    await tick();
    expect(f.pending()).toHaveLength(2); // both at cap → job3 queues

    f.release("flaky"); // flaky goes down for good (stays unreachable)
    expect((await job1).ok).toBe(false);

    // Ride out the retry cap: flaky exhausts all 10 probes …
    await tick(700);
    // … but job3 must NOT be rejected — `steady` is healthy and will free up.
    expect(settled).toBe(false);

    f.release("steady");
    await tick(); // job2 finishes → its slot goes straight to job3 on `steady`
    expect(f.pending()).toEqual(["steady"]);
    f.release("steady");
    const [res2, res3] = await Promise.all([job2, job3]);
    expect(res2.ok).toBe(true);
    expect(res3.ok).toBe(true);
    expect(f.cmds.flaky).toHaveLength(1); // never dispatched there again
  }, 15_000);
});

describe("outer SSH timeout covers the lock wait, not just the run (#0521 review)", () => {
  // The outer SSH-level timeout wraps BOTH phases as one process (waiting
  // for a free host slot, then the actual build+test). A fixed
  // remoteRunTimeoutMs regardless of how long the lock was allowed to wait
  // first meant a run that legitimately queued for most of its wait budget
  // then had only the remainder left for a normally-healthy suite — it
  // could be SIGKILLed and reported as an infra failure purely because of
  // how long it queued, never because anything was actually wrong.
  it("adds the lock wait budget on top of remoteRunTimeoutMs when there is no deadline", async () => {
    const root = tmpRoot();
    const runRemote = vi.fn(
      async (_host: unknown, cmd: string, _onChunk?: unknown, _timeoutMs?: number) => {
        if (cmd.includes(PREREQ_OK_TOKEN))
          return {
            code: 0,
            output: `${RUNNER_SCRIPT_MIRROR_TOKEN}=1 ${PREREQ_OK_TOKEN}`,
            timedOut: false,
          };
        if (cmd.includes("__HOST_LOCK__"))
          return { code: 0, output: "__HOST_LOCK__\n", timedOut: false };
        return { code: 0, output: "ok", timedOut: false };
      },
    );
    const exec: RemoteExecDeps = {
      bundleRepo: vi.fn(async () => ({ ok: true })),
      uploadFile: vi.fn(async () => ({ ok: true })),
      downloadDir: vi.fn(async () => {}),
      runRemote,
      probeTcp: vi.fn(async () => true),
    };
    const config = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "ai",
      cacheDir: ".repoos",
      remoteValidation: { enabled: true, provider: "tailscale", tailscaleHosts: [{ host: "a" }] },
    } as unknown as RepoOSConfig;
    const remoteRunTimeoutMs = 60_000; // small, test-friendly stand-in
    const runner = new TailscaleRunner(config, undefined, {
      exec,
      timings: { healthRetryMs: 40, probeTimeoutMs: 1_000, remoteRunTimeoutMs },
    });
    await runner.validate(opts("0001"));
    // No deadline passed → the wait budget is DEFAULT_HOST_LOCK_WAIT_SECS.
    const runCall = runRemote.mock.calls.find(
      (c) => !String(c[1]).includes(PREREQ_OK_TOKEN) && !String(c[1]).includes("__HOST_LOCK__"),
    );
    expect(runCall?.[3]).toBe(remoteRunTimeoutMs + DEFAULT_HOST_LOCK_WAIT_SECS * 1000);
  });
});

describe("queue deadlines (#0521)", () => {
  it("cancels a queued run at the caller's deadline and frees its slot", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }] });
    const first = f.runner.validate(opts("0001"));
    await tick();
    expect(f.pending()).toEqual(["a"]);

    const chunks: string[] = [];
    const doomed = f.runner.validate(
      opts("0002", { deadlineAt: Date.now() + 300, onChunk: (c: string) => chunks.push(c) }),
    );
    await tick();
    expect(chunks.join("")).toContain("queued behind 1 other remote run(s)");

    const summary = await doomed;
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toMatch(/deadline passed/);
    expect(summary.detail).toContain("slot released");

    // The cancelled waiter left nothing behind: a later job runs normally.
    f.release();
    const third = f.runner.validate(opts("0003"));
    await tick();
    expect(f.pending()).toEqual(["a"]);
    f.release();
    await Promise.all([first, third]);
  });

  it("cancels a run that reaches its host after the caller's deadline (#0521 spec 5)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }] });
    // The fast path hands over a free slot without re-checking the deadline
    // (dispatch can also win the race with the queue timer) — the run itself
    // must then refuse to enter the host lock and hold it.
    const summary = await f.runner.validate(opts("0001", { deadlineAt: Date.now() - 1 }));
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toContain("deadline passed");
    expect(f.pending()).toHaveLength(0); // never started a suite
    expect(f.cmds.a ?? []).toHaveLength(0); // …so it never entered the host lock
  });

  it("rounds the lock wait budget down to the shell's 5s steps, never past the deadline", () => {
    const now = 1_000_000;
    // The shell tries the slot at 0s, 5s, 10s … and checks its budget only
    // after a failed attempt, so WAIT must be a multiple of 5 ≤ the budget —
    // the old Math.max(10, …) floor let a dead caller's run wait (and enter)
    // up to 10 s past its deadline.
    expect(deadlineLockWaitSecs(now + 7_000, now)).toBe(5);
    expect(deadlineLockWaitSecs(now + 4_999, now)).toBe(0); // attempt-now-or-give-up
    expect(deadlineLockWaitSecs(now + 12_001, now)).toBe(10);
    expect(deadlineLockWaitSecs(now - 6_000, now)).toBe(0); // already past
    expect(deadlineLockWaitSecs(now + 30 * 60_000, now)).toBe(DEFAULT_HOST_LOCK_WAIT_SECS);
  });
});

// ── cross-process host lock (real shell) ─────────────────────────────────────

function sh(script: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", script]);
    let out = "";
    child.stdout.on("data", (b: Buffer) => (out += b.toString()));
    child.stderr.on("data", (b: Buffer) => (out += b.toString()));
    child.on("close", (code) => resolve({ code, out }));
  });
}

describe("host lock observability and dispatch (#0705)", () => {
  it("close-out lock priority beats engineer self-check", () => {
    expect(hostLockPriority("close-out")).toBeGreaterThan(
      hostLockPriority("pre-review", { REPOOS_AGENT: "1" }),
    );
  });

  it("parses portable lock inspect output", () => {
    const snap = parseHostLockInspectOutput(
      '__HOST_LOCK__\nhold\t0\t90\n{"taskId":"0694","phase":"self-check","worktree":"/x/y"}\n' +
        'wait\t1\t30\n{"taskId":"0693","phase":"close-out"}\n',
    );
    expect(snap.holders).toHaveLength(1);
    expect(snap.holders[0]).toMatchObject({
      label: "#0694",
      phase: "self-check",
      ageSecs: 90,
    });
    expect(snap.waiters[0]).toMatchObject({
      label: "#0693",
      phase: "close-out",
      queuePosition: 1,
    });
  });

  it("dispatches to a free host when another host's slots are held by standalone checks", async () => {
    const f = poolFixture({
      hosts: [
        { host: "bee", maxConcurrent: 2 },
        { host: "linux2", maxConcurrent: 1 },
      ],
      hostLockOccupancy: { bee: 2 },
    });
    const job = f.runner.validate(opts("0693", { phase: "close-out" }));
    await tick();
    expect(f.pending()).toEqual(["linux2"]);
    f.release("linux2");
    expect(await job).toMatchObject({ ok: true });
  });
});

describe("host-side lock (server + standalone CLI share one limit)", () => {
  it("serialises two independent processes on a one-slot host", async () => {
    const root = tmpRoot();
    const lockRoot = join(root, "locks");
    const marks = join(root, "marks.log");
    const inner = `echo start >> "${marks}" && sleep 0.5 && echo end >> "${marks}"`;
    const script = hostLockShell({ slots: 1, waitSecs: 30, lockRoot, inner });
    const [a, b] = await Promise.all([sh(script), sh(script)]);
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    const lines = readFileSync(marks, "utf8").trim().split("\n");
    expect(lines).toEqual(["start", "end", "start", "end"]); // never overlapping
    expect(a.out + b.out).toContain("[lock] slot 0 acquired");
  }, 30_000);

  it("honors the lowest active limit when callers disagree after a live config change", async () => {
    const root = tmpRoot();
    const lockRoot = join(root, "locks");
    mkdirSync(join(lockRoot, "1"), { recursive: true });
    writeFileSync(join(lockRoot, "1", ".limit"), "2\n");
    const lower = await sh(
      hostLockShell({ slots: 1, waitSecs: 0, lockRoot, inner: "echo SHOULD_NOT_RUN" }),
    );
    expect(lower.code).toBe(HOST_LOCK_TIMEOUT_EXIT);
    expect(lower.out).not.toContain("SHOULD_NOT_RUN");

    rmSync(join(lockRoot, "1"), { recursive: true });
    mkdirSync(join(lockRoot, "0"), { recursive: true });
    writeFileSync(join(lockRoot, "0", ".limit"), "1\n");
    const higher = await sh(
      hostLockShell({ slots: 2, waitSecs: 0, lockRoot, inner: "echo SHOULD_NOT_RUN" }),
    );
    expect(higher.code).toBe(HOST_LOCK_TIMEOUT_EXIT);
    expect(higher.out).not.toContain("SHOULD_NOT_RUN");
  });

  it("lets a holder expire the waiter with a clear timeout instead of a red gate", async () => {
    const root = tmpRoot();
    const lockRoot = join(root, "locks");
    const marks = join(root, "marks.log");
    const holder = hostLockShell({
      slots: 1,
      waitSecs: 30,
      lockRoot,
      inner: `echo start >> "${marks}" && sleep 2 && echo end >> "${marks}"`,
    });
    const waiter = hostLockShell({
      slots: 1,
      waitSecs: 0, // give up immediately — used when the caller's deadline is gone
      lockRoot,
      inner: `echo start >> "${marks}"`,
    });
    const held = sh(holder);
    // Sequence the race: the holder must actually hold the slot first, or the
    // waiter would legitimately win it under a loaded test runner.
    const grabDeadline = Date.now() + 5_000;
    while (Date.now() < grabDeadline) {
      if (existsSync(marks) && readFileSync(marks, "utf8").includes("start")) break;
      await tick(20);
    }
    expect(readFileSync(marks, "utf8")).toContain("start");

    const timedOut = await sh(waiter);
    expect(timedOut.code).toBe(HOST_LOCK_TIMEOUT_EXIT);
    expect(timedOut.out).toContain("[lock] timed out");
    expect((await held).code).toBe(0);
    // The waiter never ran the gate; the holder's slot was released afterwards.
    expect(readFileSync(marks, "utf8").trim().split("\n")).toEqual(["start", "end"]);
    const again = await sh(
      hostLockShell({ slots: 1, waitSecs: 0, lockRoot, inner: `echo again >> "${marks}"` }),
    );
    expect(again.code).toBe(0);
    expect(readFileSync(marks, "utf8").trim().split("\n")).toEqual(["start", "end", "again"]);
  }, 30_000);

  it("keeps the stale threshold inside the wait budget and well past the heartbeat (#0521 review)", () => {
    // A waiter only ever waits DEFAULT_HOST_LOCK_WAIT_SECS, so a stale
    // threshold beyond it (the old 40 minutes vs a 15-minute wait) meant the
    // next waiter timed out with a misleading "another repoos check is still
    // running" before the orphan dir was even breakable.
    expect(HOST_LOCK_STALE_MINUTES * 60).toBeLessThan(DEFAULT_HOST_LOCK_WAIT_SECS);
    // …and a live holder must refresh several times over within the stale
    // window, so a merely loaded host is never mistaken for a dead one.
    expect(HOST_LOCK_HEARTBEAT_SECS * 3).toBeLessThanOrEqual(HOST_LOCK_STALE_MINUTES * 60);
  });

  it("locks under $HOME, never /tmp (runner-scratch fixes #0528/#0544)", () => {
    const cmd = hostLockShell({ slots: 1, waitSecs: 0, inner: "true" });
    expect(cmd).toContain('LOCKROOT="$HOME/.repoos-validate-locks"');
    expect(cmd).not.toContain("/tmp/repoos-validate-locks");
  });

  it("refuses to acquire a FREE slot once already past an absolute deadline (#0521 review)", async () => {
    // waitSecs alone is a relative budget fixed on the local side before SSH
    // even connects — a slow handshake could let a run start after the
    // caller's real deadline with a merely relative wait. Passing the
    // absolute deadline makes the remote script self-clock instead, and it
    // must refuse the FIRST acquisition attempt outright, not just time out
    // after failing to grab an already-occupied slot.
    const root = tmpRoot();
    const lockRoot = join(root, "locks");
    const past = Math.floor(Date.now() / 1000) - 10;
    const res = await sh(
      hostLockShell({
        slots: 1,
        waitSecs: 30,
        lockRoot,
        deadlineAtEpochSecs: past,
        inner: "echo SHOULD_NOT_RUN",
      }),
    );
    expect(res.code).toBe(HOST_LOCK_TIMEOUT_EXIT);
    expect(res.out).toContain("deadline had already passed");
    expect(res.out).not.toContain("SHOULD_NOT_RUN");
  });

  it("self-clocks a waiting run against the absolute deadline, not the local relative counter", async () => {
    const root = tmpRoot();
    const lockRoot = join(root, "locks");
    const marks = join(root, "marks.log");
    const holder = hostLockShell({
      slots: 1,
      waitSecs: 30,
      lockRoot,
      inner: `echo start >> "${marks}" && sleep 20 && echo end >> "${marks}"`,
    });
    const held = sh(holder);
    const grabDeadline = Date.now() + 5_000;
    while (Date.now() < grabDeadline) {
      if (existsSync(marks) && readFileSync(marks, "utf8").includes("start")) break;
      await tick(20);
    }
    expect(readFileSync(marks, "utf8")).toContain("start");

    // A deadline 2s away, but waitSecs is still 30 — without the fix this
    // would wait the full 30s (or until the holder frees the slot).
    const near = Math.floor(Date.now() / 1000) + 2;
    const t0 = Date.now();
    const waiter = await sh(
      hostLockShell({
        slots: 1,
        waitSecs: 30,
        lockRoot,
        deadlineAtEpochSecs: near,
        inner: "echo WAITER_RAN",
      }),
    );
    expect(waiter.code).toBe(HOST_LOCK_TIMEOUT_EXIT);
    expect(Date.now() - t0).toBeLessThan(15_000); // well under waitSecs' 30s
    expect(waiter.out).not.toContain("WAITER_RAN");
    expect((await held).code).toBe(0);
  }, 30_000);

  it("breaks an orphaned lock dir within the wait budget instead of timing out on it (#0521 review)", async () => {
    // The shape a SIGKILLed run leaves behind: the slot dir exists but nobody
    // heartbeats it any more. The old 40-minute threshold was longer than the
    // 15-minute wait, so the next waiter always gave up before it could break
    // the orphan — with the heartbeat-based threshold it recovers on its first
    // stale sweep.
    const root = tmpRoot();
    const lockRoot = join(root, "locks");
    const slot = join(lockRoot, "0");
    mkdirSync(slot, { recursive: true });
    execFileSync("touch", ["-t", "200001010000", slot]); // last heartbeat: 2000-01-01
    const marks = join(root, "marks.log");
    const res = await sh(
      hostLockShell({
        slots: 1,
        waitSecs: 30,
        lockRoot,
        staleMinutes: 1,
        inner: `echo ran >> "${marks}"`,
      }),
    );
    expect(res.code).toBe(0);
    expect(res.out).toContain("[lock] slot 0 acquired");
    expect(readFileSync(marks, "utf8")).toContain("ran");
  }, 30_000);

  it("heartbeats the slot dir while the holder runs, so staleness means 'dead' not 'slow' (#0521 review)", async () => {
    const root = tmpRoot();
    const lockRoot = join(root, "locks");
    const slot = join(lockRoot, "0");
    const marks = join(root, "marks.log");
    const run = sh(
      hostLockShell({
        slots: 1,
        waitSecs: 0,
        lockRoot,
        heartbeatSecs: 1, // one tick per second so the test can observe it
        inner: `echo start >> "${marks}" && sleep 5 && echo end >> "${marks}"`,
      }),
    );
    const grabDeadline = Date.now() + 5_000;
    while (Date.now() < grabDeadline && !existsSync(slot)) await tick(20);
    expect(existsSync(slot)).toBe(true);
    const first = statSync(slot).mtimeMs;
    await tick(1_600); // ≥ one tick: the heartbeat must have touched the dir
    expect(statSync(slot).mtimeMs).toBeGreaterThan(first);
    expect((await run).code).toBe(0);
    // Normal release still removes the dir (and kills the heartbeat).
    expect(existsSync(slot)).toBe(false);
  }, 30_000);
});

// ── prerequisite command shape ───────────────────────────────────────────────

describe("per-host prerequisite probe", () => {
  it("checks docker + the artifacts-aware validate.sh when runner is unset (default)", () => {
    const cmd = prereqProbeCommand(undefined);
    expect(cmd).toContain("docker info");
    expect(cmd).toContain("/opt/repoos/validate.sh");
    expect(cmd).toContain("grep -qF '${3'");
    expect(cmd).toContain(PREREQ_OK_TOKEN);
    expect(cmd).toContain(RUNNER_SCRIPT_MIRROR_TOKEN);
    expect(cmd).not.toContain("bun not found");
  });

  it('checks docker when runner is explicitly "docker"', () => {
    const cmd = prereqProbeCommand("docker");
    expect(cmd).toContain("docker info");
    expect(cmd).not.toContain("bun not found");
    // git DOES run on the host for docker too — checked separately below
    // (#0521 review: validate.sh's git clone happens before docker run).
  });

  it("checks the configured image exists, not just that the daemon runs (#0521 review)", () => {
    // A reachable Docker daemon with the image never built/pulled used to be
    // reported healthy anyway, then fail every job it received.
    const cmd = prereqProbeCommand("docker", "repoos-ci");
    expect(cmd).toContain("docker image inspect 'repoos-ci'");
    // Default image name when unset, matching every other call site's fallback.
    expect(prereqProbeCommand("docker")).toContain("docker image inspect 'repoos-ci'");
  });

  it("uses a project's configured containerImage, not the default", () => {
    const cmd = prereqProbeCommand("docker", "my-org/custom-ci:v2");
    expect(cmd).toContain("docker image inspect 'my-org/custom-ci:v2'");
  });

  it("never checks for an image on a native host", () => {
    const cmd = prereqProbeCommand("native", "repoos-ci");
    expect(cmd).not.toContain("docker image inspect");
  });

  it("strips a single quote from a hand-edited image name rather than breaking the probe", () => {
    const cmd = prereqProbeCommand("docker", "weird'name");
    expect(cmd).toContain("docker image inspect 'weirdname'");
  });

  it('checks bun/git, not docker, when runner is "native" (#0521 review, both directions)', () => {
    // Two prior versions of this got the SAME field wrong in opposite
    // directions by branching on `os` instead of a dedicated `runner`: one
    // checked bun/git unconditionally on macOS (fails a real Docker-based
    // macOS host, like mini), the other checked Docker unconditionally
    // everywhere (fails a real native macOS host, installed via
    // `just setup-<host>-native` / validate-macos.sh). `runner` says
    // explicitly which one a given host actually uses, independent of `os`.
    const cmd = prereqProbeCommand("native");
    expect(cmd).toContain("bun not found");
    expect(cmd).toContain("git not found");
    expect(cmd).not.toContain("docker info");
    expect(cmd).toContain(PREREQ_OK_TOKEN);
  });

  it("checks the bun cache dir is writable on a native host", () => {
    // Native: bun runs directly as the SSH user, no container/uid involved,
    // so a plain host-path write-then-remove is an accurate test.
    const cmd = prereqProbeCommand("native");
    expect(cmd).toContain("$HOME/.cache/repoos-bun");
    expect(cmd).toContain("is not writable");
  });

  it("checks the bun cache VOLUME is writable by the container, on docker (#0521 review, third round)", () => {
    // Docker: the cache is a named volume, not a host bind-mount (see
    // validate.sh's own comment for why — a permissive host chmod turned
    // out to be invisible to the container on macOS/Colima, which maps a
    // bind-mounted dir to root:root 0755 inside the VM regardless of the
    // real host-side permissions, confirmed live). Probe the exact sequence
    // validate.sh runs: chown the volume as root, then write as uid 1000.
    const cmd = prereqProbeCommand("docker", "repoos-ci");
    expect(cmd).toContain(`docker volume create ${CACHE_VOLUME_NAME}`);
    expect(cmd).toContain(`-v ${CACHE_VOLUME_NAME}:/bun-cache -u 0`);
    expect(cmd).toContain("chown 1000:1000 /bun-cache");
    expect(cmd).toContain(`-v ${CACHE_VOLUME_NAME}:/bun-cache -u 1000`);
    expect(cmd).toContain("is not writable by the container even after chown as root");
    // Never a host path for docker — that was the earlier, broken approach.
    expect(cmd).not.toContain("$HOME/.cache/repoos-bun");
  });

  it("never checks the cache volume on a native host", () => {
    const cmd = prereqProbeCommand("native");
    expect(cmd).not.toContain("docker volume create");
  });

  it("checks git on Docker hosts too — validate.sh clones on the HOST regardless of runner (#0521 review)", () => {
    // git clone/checkout happens before docker run is ever invoked, for
    // every runner — a Docker host missing git used to be reported healthy
    // and fail at the very first step of every job.
    const cmd = prereqProbeCommand("docker");
    expect(cmd).toContain('command -v git >/dev/null 2>&1 || { echo "git not found on PATH"');
  });
});

describe("hostRunner", () => {
  it('defaults to "docker" when unset', () => {
    expect(hostRunner({ host: "bee" })).toBe("docker");
  });

  it('is "native" only when the row explicitly says so', () => {
    expect(hostRunner({ host: "mini", runner: "native" })).toBe("native");
    expect(hostRunner({ host: "mini", runner: "docker" })).toBe("docker");
  });
});

// ── hang detection + container cleanup + cache isolation (#0729) ─────────────

describe("hang detector (#0729)", () => {
  it("thresholds: default 5 minutes, configurable, floored at a positive value", () => {
    expect(hangIdleThresholdMs()).toBe(DEFAULT_HANG_IDLE_MINUTES * 60_000);
    expect(hangIdleThresholdMs(2)).toBe(120_000);
    expect(hangIdleThresholdMs(0)).toBe(DEFAULT_HANG_IDLE_MINUTES * 60_000);
    expect(hangIdleThresholdMs(undefined)).toBe(300_000);
  });

  it("normalises load average per CPU; unknown load is never 'idle'", () => {
    expect(loadPerCpu([4, 4, 4], 4)).toBe(1);
    expect(loadPerCpu([0.2, 0.2, 0.2], 4)).toBeCloseTo(0.05);
    // Missing / non-finite inputs → Infinity (never counted as idle).
    expect(loadPerCpu(undefined, 8)).toBe(Number.POSITIVE_INFINITY);
    expect(loadPerCpu([Number.NaN, 0, 0], 8)).toBe(Number.POSITIVE_INFINITY);
    // Unknown CPU count falls back to 1 (conservative).
    expect(loadPerCpu([3, 3, 3], undefined)).toBe(3);
  });

  it("fires only when output is idle AND the host is idle", () => {
    const thresholdMs = 300_000;
    const now = 10_000_000;
    const quiet = now - thresholdMs - 1;
    // Idle output + idle host → hung.
    expect(detectHungRun({ lastOutputAt: quiet, now, thresholdMs, loadPerCpu: 0.1 })).toBe(true);
    // Output advanced recently → not hung, even on an idle host.
    expect(detectHungRun({ lastOutputAt: now - 1_000, now, thresholdMs, loadPerCpu: 0.1 })).toBe(
      false,
    );
    // Host busy → not hung (the run may simply be queued behind real work).
    expect(detectHungRun({ lastOutputAt: quiet, now, thresholdMs, loadPerCpu: 4 })).toBe(false);
    // Unknown load (Infinity) → not hung.
    expect(
      detectHungRun({
        lastOutputAt: quiet,
        now,
        thresholdMs,
        loadPerCpu: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
    // Gate already finished — quiet container is not a hang (#0739).
    expect(
      detectHungRun({ lastOutputAt: quiet, now, thresholdMs, loadPerCpu: 0.1, gateFinished: true }),
    ).toBe(false);
  });

  it("treats exactly-threshold idle time as hung (inclusive)", () => {
    const now = 1_000_000;
    expect(
      detectHungRun({ lastOutputAt: now - 300_000, now, thresholdMs: 300_000, loadPerCpu: 0 }),
    ).toBe(true);
  });

  it("HangWatchdog fires onHung exactly once and stops after firing", () => {
    let now = 0;
    let load = 0.1;
    let killed = 0;
    const wd = new HangWatchdog({
      thresholdMs: 300_000,
      loadPerCpu: () => load,
      onHung: () => {
        killed++;
      },
      checkIntervalMs: 1,
      now: () => now,
    });
    // Fresh output → not hung.
    now = 100_000;
    wd.noteOutput();
    now = 200_000;
    expect(wd.check()).toBe(false);
    // Idle past the threshold on an idle host → fires once.
    now = 500_000;
    expect(wd.check()).toBe(true);
    expect(killed).toBe(1);
    expect(wd.hung).toBe(true);
    // Never fires again, even if checked.
    now = 900_000;
    expect(wd.check()).toBe(false);
    expect(killed).toBe(1);
  });

  it("HangWatchdog does NOT fire while output keeps moving", () => {
    let now = 0;
    let killed = 0;
    const wd = new HangWatchdog({
      thresholdMs: 300_000,
      loadPerCpu: () => 0.1,
      onHung: () => {
        killed++;
      },
      checkIntervalMs: 1,
      now: () => now,
    });
    // Output arrives every 4 minutes for an hour — never quiet past 5 min.
    for (let i = 0; i < 15; i++) {
      now += 240_000;
      wd.noteOutput();
      expect(wd.check()).toBe(false);
    }
    expect(killed).toBe(0);
    expect(wd.hung).toBe(false);
  });

  it("HangWatchdog never kills a hive of output when the host is busy", () => {
    let now = 0;
    let load = 6;
    let killed = 0;
    const wd = new HangWatchdog({
      thresholdMs: 300_000,
      loadPerCpu: () => load,
      onHung: () => {
        killed++;
      },
      checkIntervalMs: 1,
      now: () => now,
    });
    now = 3_600_000; // an hour with no output, but load 6/1cpu
    expect(wd.check()).toBe(false);
    // The moment the host goes idle, the same stalled run is hung.
    load = 0;
    expect(wd.check()).toBe(true);
    expect(killed).toBe(1);
  });

  it("hostLoadCommand samples load and CPU count", () => {
    const cmd = hostLoadCommand();
    expect(cmd).toContain("uptime");
    expect(cmd).toContain("__CPU__");
    expect(cmd).toContain("nproc");
  });
});

describe("hung container cleanup (#0729)", () => {
  it("names one run's container uniquely and safely", () => {
    const name = validateContainerName("0729-ab12cd34");
    expect(name).toBe("repoos-validate-0729-ab12cd34");
    // Unsafe characters are stripped to the Docker name charset.
    expect(validateContainerName("a/b c$d")).toBe("repoos-validate-a_b_c_d");
    // Empty / unusable ids still yield a named container.
    expect(validateContainerName("")).toBe("repoos-validate-run");
  });

  it("kills only the named container, never by a pattern", () => {
    const cmd = killContainerCommand("repoos-validate-0729-ab12cd34");
    expect(cmd).toBe("docker rm -f 'repoos-validate-0729-ab12cd34' >/dev/null 2>&1 || true");
    // A hostile name cannot inject a second command.
    expect(killContainerCommand("bad; rm -rf /")).not.toContain("; rm -rf /");
  });

  it("sweeps stale containers by the repoos-validate- prefix only", () => {
    const cmd = staleContainerCleanupCommand();
    expect(cmd).toContain("docker ps -aq");
    expect(cmd).toContain("name=repoos-validate-");
    expect(cmd).toContain("xargs -r docker rm -f");
    // Never a blanket kill of every container on the host.
    expect(cmd).not.toMatch(/docker ps -aq\s*\|/);
  });

  it("sweeps only NOT-running containers, so a probe never kills a live sibling run", () => {
    // Probes run on a background timer while a sibling job (maxConcurrent > 1)
    // may still be executing; sweeping `docker ps -aq` unfiltered would remove
    // that in-flight container (#0729 review). Only leftovers are removed.
    const cmd = staleContainerCleanupCommand();
    expect(cmd).toContain("status=created");
    expect(cmd).toContain("status=exited");
    expect(cmd).toContain("status=dead");
    expect(cmd).not.toContain("status=running");
    // `docker ps` with no status filter would include running containers.
    expect(cmd).not.toMatch(/--filter\s+'?name=repoos-validate-'?\s+2>/);
  });

  it("docs distinguish confirmed workdir deletion from unproven cache corruption (#0735)", () => {
    const doc = readFileSync(join(process.cwd(), "docs/remote-validation.md"), "utf8");
    expect(doc).toMatch(/Confirmed.*workdir|Confirmed:.*startup/i);
    expect(doc).toMatch(/unproven|Not proven|plausible/i);
    expect(doc).toMatch(/EXIT[`']? trap/);
    expect(doc).not.toMatch(/corruption behind the 2026-10-06\/07 hangs/);
  });

  it("startup does not globally sweep sibling work dirs in the pre-container window (#0729 review)", async () => {
    // Confirmed root cause: a pre-lock `rm -rf` of $HOME/.repoos-validate.* hit
    // a sibling's $WORK before its container existed (invisible to mount guards)
    // and emptied /repo mid-run. The fix is no global workdir sweep at startup;
    // each run cleans only its own $WORK in the EXIT trap.
    const script = shippedValidateSh();
    expect(script).not.toBe("");
    expect(script).not.toMatch(/for _stale in.*\.repoos-validate/);
    expect(script).toMatch(/trap _rvcleanup EXIT/);
    expect(script).toMatch(/rm -rf "\$WORK"/);

    const startup = validatePreWorkStartup(script);
    const root = tmpRoot();
    const home = join(root, "home");
    mkdirSync(home, { recursive: true });
    const workA = join(home, ".repoos-validate.aaaaaa");
    const marker = join(workA, "repo", "marker");

    const hold = (async () => {
      mkdirSync(join(workA, "repo"), { recursive: true });
      writeFileSync(marker, "preserve");
      await tick(300);
    })();
    const startupRun = sh(`export HOME=${JSON.stringify(home)} IMAGE=repoos-ci; ${startup}`);
    await Promise.all([hold, startupRun]);
    expect(readFileSync(marker, "utf8")).toBe("preserve");
  });

  it("probes for stale containers when checking a docker host", () => {
    const cmd = prereqProbeCommand("docker", "repoos-ci");
    expect(cmd).toContain("name=repoos-validate-");
    expect(cmd).toContain(staleBundlePruneCommand());
  });

  it("builds a per-run cleanup command for bundle and artifacts (#0739)", () => {
    const paths = remoteRunPaths("0739", "deadbeef");
    const cmd = remoteRunCleanupCommand(paths);
    expect(cmd).toContain(paths.bundle);
    expect(cmd).toContain(paths.artifacts);
    expect(remoteRunHasGateExit("log\n[validate] gate exit 1\n")).toBe(true);
  });

  it("does not sweep containers on a native host", () => {
    expect(prereqProbeCommand("native")).not.toContain("name=repoos-validate-");
  });
});

describe("per-slot cache isolation (#0729)", () => {
  it("slot 0 keeps the base volume so a warm cache is reused", () => {
    expect(cacheVolumeForSlot(CACHE_VOLUME_NAME, 0)).toBe(CACHE_VOLUME_NAME);
  });

  it("every other slot gets its own volume", () => {
    expect(cacheVolumeForSlot(CACHE_VOLUME_NAME, 1)).toBe(`${CACHE_VOLUME_NAME}-slot1`);
    expect(cacheVolumeForSlot(CACHE_VOLUME_NAME, 5)).toBe(`${CACHE_VOLUME_NAME}-slot5`);
    // Distinct slots never share a volume.
    expect(cacheVolumeForSlot(CACHE_VOLUME_NAME, 2)).not.toBe(
      cacheVolumeForSlot(CACHE_VOLUME_NAME, 3),
    );
  });

  it("clamps nonsensical slot indices to the base volume", () => {
    expect(cacheVolumeForSlot(CACHE_VOLUME_NAME, -1)).toBe(CACHE_VOLUME_NAME);
    expect(cacheVolumeForSlot(CACHE_VOLUME_NAME, 1.5)).toBe(CACHE_VOLUME_NAME);
    expect(cacheVolumeForSlot(CACHE_VOLUME_NAME, Number.NaN)).toBe(CACHE_VOLUME_NAME);
  });

  it("the host lock's slot index is what isolates the cache (validate.sh contract)", () => {
    // validate.sh reads REPOOS_SLOT (exported by hostLockShell's inner) and
    // appends it to the base volume — the same key hostLockShell computes.
    const script = hostLockShell({
      slots: 2,
      waitSecs: 0,
      inner: 'REPOOS_SLOT="$_rvslot" bash validate.sh a b c',
    });
    expect(script).toContain("_rvslot=");
    expect(script).toContain('REPOOS_SLOT="$_rvslot"');
  });
});

describe("pool hung-run bookkeeping (#0729)", () => {
  it("markHung flags the in-flight run and keeps a bounded recent list", () => {
    const pool = new TailscaleHostPool(
      { enabled: true, provider: "tailscale", tailscaleHosts: [{ host: "a" }] },
      { exec: {} as unknown as RemoteExecDeps },
    );
    // markHung on a fresh host with no active run records the cleanup event.
    pool.markHung("a", "killed on request");
    const status = pool.status();
    expect(status[0]!.hungRuns).toHaveLength(1);
    expect(status[0]!.hungRuns![0]!.detail).toBe("killed on request");
  });

  it("killHungRun reports when there is no in-flight run for the task", async () => {
    const pool = new TailscaleHostPool(
      { enabled: true, provider: "tailscale", tailscaleHosts: [{ host: "a" }] },
      { exec: {} as unknown as RemoteExecDeps },
    );
    const result = await pool.killHungRun("0729");
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/no in-flight remote validation run/);
  });
});

describe("hung run recovery end to end (#0729)", () => {
  it("shows hung · killing on the active run while the kill SSH is still pending (#0735)", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }],
      fixedLoad: 0,
      hangIdleMinutes: 0.0005,
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
      delayKill: true,
    });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();

    const resultPromise = f.runner.validate(opts("0735"));
    let attempts = 0;
    while (attempts++ < 200 && f.killed.length === 0) await tick(5);
    expect(f.killed).toHaveLength(1);

    const inFlight = f.runner.hostStatus()?.[0];
    expect(inFlight?.activeRuns?.some((r) => r.taskId === "0735" && r.hung)).toBe(true);
    expect(inFlight?.hungRuns ?? []).toHaveLength(0);

    f.releaseKill();
    const summary = await resultPromise;
    expect(summary.hung).toBe(true);
    expect(f.runner.hostStatus()?.[0]?.activeRuns ?? []).toHaveLength(0);
    expect(f.runner.hostStatus()?.[0]?.hungRuns).toHaveLength(1);
  });

  it("kills a stalled run's container and retries it on another host", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }, { host: "b" }],
      retryOtherHosts: true,
      fixedLoad: 0, // both hosts idle — a stalled run there is hung
      hangIdleMinutes: 0.0005, // ~30ms idle threshold
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
    });
    // Hosts must be probed before dispatch.
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();

    const resultPromise = f.runner.validate(opts("0729"));
    // The run stalls on the first host with no output.
    let attempts = 0;
    while (attempts++ < 200) {
      if (f.killed.length > 0) break;
      await tick(5);
    }
    expect(f.killed).toHaveLength(1);
    expect(f.killed[0]).toMatch(/^repoos-validate-/);

    // The hung run is retried on the OTHER host (a fresh pending run).
    attempts = 0;
    while (attempts++ < 200) {
      if (f.pending().length > 0) break;
      await tick(5);
    }
    expect(f.pending()).toHaveLength(1);

    // Finish the retry so validate() settles.
    f.release();
    const summary = await resultPromise;
    expect(summary.ok).toBe(true);

    // The pool recorded the hang for the Remote runners tab.
    const hung = f.runner.hostStatus()?.flatMap((h) => h.hungRuns ?? []) ?? [];
    expect(hung).toHaveLength(1);
    expect(hung[0]!.taskId).toBe("0729");
  });

  it("releases the pool slot when hang kill completes (#0739)", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }],
      fixedLoad: 0,
      hangIdleMinutes: 0.0005,
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
      delayKill: true,
    });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();
    const resultPromise = f.runner.validate(opts("0739-slot"));
    let attempts = 0;
    while (attempts++ < 200 && f.killed.length === 0) await tick(5);
    f.releaseKill();
    for (let i = 0; i < 30; i++) {
      if ((f.runner.hostStatus()?.[0]?.activeRuns ?? []).length === 0) break;
      await tick(5);
    }
    expect(f.runner.hostStatus()?.[0]?.activeRuns ?? []).toHaveLength(0);
    await resultPromise;
  });

  it("releases the slot when hang kill SSH times out and marks the host degraded (#0739)", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }],
      fixedLoad: 0,
      hangIdleMinutes: 0.0005,
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
      hangKillNeverCompletes: true,
    });
    const runner = new TailscaleRunner(f.config, undefined, {
      exec: f.exec,
      timings: {
        healthRetryMs: 40,
        probeTimeoutMs: 1_000,
        hangIdleMinutes: 0.0005,
        hangCheckIntervalMs: 15,
        loadSampleIntervalMs: 10,
        hangKillTimeoutMs: 50,
      },
    });
    for (let i = 0; i < 40 && !runner.hostStatus()?.every((h) => h.probed); i++) await tick();
    const resultPromise = runner.validate(opts("0739-timeout"));
    let attempts = 0;
    while (attempts++ < 200 && f.killed.length === 0) await tick(5);
    for (let i = 0; i < 40; i++) {
      if ((runner.hostStatus()?.[0]?.activeRuns ?? []).length === 0) break;
      await tick(10);
    }
    expect(runner.hostStatus()?.[0]?.activeRuns ?? []).toHaveLength(0);
    expect(runner.hostStatus()?.[0]?.healthy).toBe(false);
    await resultPromise;
  });

  it("does not classify a run as hung after the gate has exited (#0739)", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }],
      gateExitStallOn: ["a"],
      fixedLoad: 0,
      hangIdleMinutes: 0.0005,
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
    });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();
    const resultPromise = f.runner.validate(opts("0739-gate"));
    for (let i = 0; i < 50; i++) await tick(10);
    expect(f.killed).toHaveLength(0);
    f.release();
    const summary = await resultPromise;
    expect(summary.hung).toBeFalsy();
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(false);
  });

  it("cleans up bundle and artifacts after a hang kill (#0739)", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }],
      fixedLoad: 0,
      hangIdleMinutes: 0.0005,
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
    });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();
    const resultPromise = f.runner.validate(opts("0739-clean"));
    let attempts = 0;
    while (attempts++ < 200 && f.killed.length === 0) await tick(5);
    await resultPromise;
    expect(f.cleanupCmds.length).toBeGreaterThan(0);
    expect(f.cleanupCmds.some((c) => c.includes(".bundle"))).toBe(true);
  });

  it("records outcome 'hung' in the check-run history", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }],
      fixedLoad: 0,
      hangIdleMinutes: 0.0005,
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
    });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();
    const resultPromise = f.runner.validate(opts("0729"));
    let attempts = 0;
    while (attempts++ < 200 && f.killed.length === 0) await tick(5);
    const summary = await resultPromise;
    expect(summary.ok).toBe(false);
    expect(summary.hung).toBe(true);
    expect(summary.transient).toBe(true);
    // The durable history row says 'hung', not 'fail' or 'cancelled'.
    const runs = getCheckStore(f.root, ".repoos").list({ taskId: "0729" });
    expect(runs.some((r) => r.outcome === "hung")).toBe(true);
  });

  it("does not kill a stalled run while the host stays busy", async () => {
    const f = poolFixture({
      hosts: [{ host: "a" }],
      fixedLoad: 8, // busy: a stalled run may just be queued behind real work
      hangIdleMinutes: 0.0005,
      hangCheckIntervalMs: 15,
      loadSampleIntervalMs: 10,
    });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();
    const resultPromise = f.runner.validate(opts("0729"));
    // Give the watchdog many chances to (wrongly) fire.
    for (let i = 0; i < 30; i++) await tick(10);
    expect(f.killed).toHaveLength(0);
    expect(f.pending()).toHaveLength(1);
    f.release();
    expect((await resultPromise).ok).toBe(true);
  });
});

// ── container cleanup on cancel/timeout (#0729 review) ───────────────────────

describe("server-side container cleanup when a run is cancelled or times out (#0729)", () => {
  it("removes the run's container by name when the run times out", async () => {
    // A run the outer timeout SIGKILLs (or the caller's deadline cancels) can
    // leave its container running if the SSH channel is gone before
    // validate.sh's EXIT trap fires. The runner must therefore issue its own
    // scoped `docker rm -f repoos-validate-<id>` — never a blanket kill.
    const f = poolFixture({ hosts: [{ host: "a" }], timeoutRunOn: ["a"] });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();

    const summary = await f.runner.validate(opts("0729"));
    expect(summary.ok).toBe(false);
    // The cleanup is fire-and-forget; give it a tick to land.
    for (let i = 0; i < 20 && f.killed.length === 0; i++) await tick(5);
    expect(f.killed).toHaveLength(1);
    expect(f.killed[0]).toMatch(/^repoos-validate-/);
  });

  it("does not kill a container for a clean pass (validate.sh's own trap already removed it)", async () => {
    const f = poolFixture({ hosts: [{ host: "a" }] });
    for (let i = 0; i < 40 && !f.runner.hostStatus()?.every((h) => h.probed); i++) await tick();
    const resultPromise = f.runner.validate(opts("0729"));
    for (let i = 0; i < 100 && f.pending().length === 0; i++) await tick();
    f.release();
    expect((await resultPromise).ok).toBe(true);
    for (let i = 0; i < 10; i++) await tick(5);
    expect(f.killed).toHaveLength(0);
  });
});

/**
 * Remote validation host pool (#0521): dispatching jobs across several
 * tailnet hosts, capability routing (`runsOn`), per-host health with a
 * prerequisite probe, queue deadlines, and the host-side lock that makes a
 * standalone `repoos check` and the server share ONE per-host limit.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import { loadConfig } from "../../core/config.js";
import { resolveRemoteHosts, remoteHostUser } from "../../core/remote-hosts.js";
import { planJobCapabilities, resolveCheckPlan } from "../../core/check-plan.js";
import {
  HOST_LOCK_TIMEOUT_EXIT,
  PREREQ_OK_TOKEN,
  RemoteValidationRunner,
  TailscaleRunner,
  hostLockShell,
  prereqProbeCommand,
  type RemoteExecDeps,
  type RemoteExecResult,
} from "../../server/remote-validation.js";
import {
  runRemotePreReviewGate,
  remoteJobCapabilities,
} from "../../server/pre-review-remote-gate.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-pool-"));
  dirs.push(root);
  return root;
}

const tick = (ms = 10): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
    expect(cfg.remoteValidation?.tailscaleHost).toBe("mini");
    expect(resolveRemoteHosts(cfg.remoteValidation).map((h) => h.host)).toEqual(["mini"]);
  });

  it("pools a flat list plus [[…]] rows, folding the shorthand without duplicates", () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      '[remoteValidation]\nprovider = "tailscale"\n' +
        'tailscaleHost = "bee"\n' +
        'tailscaleHosts = ["bee", "linux2"]\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nuser = "nick"\nos = "macos"\n' +
        'labels = ["apple-silicon"]\nmaxConcurrent = 2\n',
    );
    const cfg = loadConfig(root);
    expect(resolveRemoteHosts(cfg.remoteValidation)).toEqual([
      { host: "bee" },
      { host: "linux2" },
      { host: "mac1", user: "nick", os: "macos", labels: ["apple-silicon"], maxConcurrent: 2 },
    ]);
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
});

// ── capability derivation from the check plan ────────────────────────────────

describe("runsOn → job capabilities", () => {
  it("unions runsOn across the plan, ignoring profile scoping", () => {
    const plan = resolveCheckPlan({
      check: {
        steps: [
          { name: "build", command: "bun run build" },
          { name: "native", command: "xcodebuild", runsOn: ["macos"] },
          { name: "contract", command: "./ci.sh", runsOn: ["macos", "apple-silicon"] },
        ],
      },
    });
    expect(plan.warnings).toEqual([]);
    expect(planJobCapabilities(plan)).toEqual(["macos", "apple-silicon"]);
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
        check: { steps: [{ name: "native", command: "xcodebuild", runsOn: ["macos"] }] },
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
        check: { steps: [{ name: "native", command: "xcodebuild", runsOn: ["macos"] }] },
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
  root: string;
  /** Host → validation commands run on it (probe excluded). */
  cmds: Record<string, string[]>;
  /** Unblock the i-th pending run (in arrival order), optionally on a host. */
  release(host?: string): string;
  pending(): string[];
  peak(): number;
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
  healthRetryMs?: number;
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
    },
  } as unknown as RepoOSConfig;

  const cmds: Record<string, string[]> = {};
  const pending: Array<{ host: string; resolve: () => void }> = [];
  const dropped = new Set<string>();
  let inFlight = 0;
  let peak = 0;
  const exec: RemoteExecDeps = {
    bundleRepo: vi.fn(async () => ({ ok: true })),
    uploadFile: vi.fn(async () => ({ ok: true })),
    downloadDir: vi.fn(async () => {}),
    runRemote: vi.fn(async (host, cmd): Promise<RemoteExecResult> => {
      if (cmd.includes(PREREQ_OK_TOKEN)) {
        if (opts.unreachable?.includes(host.ip)) {
          return {
            code: 255,
            output: "ssh: connect to host 100.x.x.x port 22: Connection timed out",
            timedOut: false,
          };
        }
        return { code: 0, output: `prereq ok ${PREREQ_OK_TOKEN}`, timedOut: false };
      }
      if (opts.dropFirstRunOn === host.ip && !dropped.has(host.ip)) {
        // Mark the run as one that WILL drop its ssh connection when released
        // (a mid-run failure, not an instant one), so jobs can queue behind it.
        dropped.add(host.ip);
        (cmds[host.ip] ??= []).push(cmd);
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => pending.push({ host: host.ip, resolve }));
        inFlight--;
        return { code: 255, output: "ssh: Connection reset by peer", timedOut: false };
      }
      (cmds[host.ip] ??= []).push(cmd);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => pending.push({ host: host.ip, resolve }));
      inFlight--;
      return { code: 0, output: "ok", timedOut: false };
    }),
    probeTcp: vi.fn(async () => true),
  };
  const runner = new TailscaleRunner(config, undefined, {
    exec,
    timings: { healthRetryMs: opts.healthRetryMs ?? 40, probeTimeoutMs: 1_000 },
  });
  return {
    runner,
    root,
    cmds,
    pending: () => pending.map((p) => p.host),
    peak: () => peak,
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

describe("TailscaleRunner pool dispatch (#0521)", () => {
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
    expect(cmd).toContain("/tmp/repoos-artifacts/logtask-"); // per-run artifacts arg
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

  it("fails clearly when no configured host provides the capability", async () => {
    const f = poolFixture({ hosts: [{ host: "linux1" }, { host: "linux2" }] });
    const summary = await f.runner.validate(opts("0001", { capabilities: ["windows"] }));
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
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

  it("rejects a non-linux job on the Hetzner runner with a routing hint", async () => {
    const root = tmpRoot();
    const runner = new RemoteValidationRunner({
      root,
      remoteValidation: { enabled: true, provider: "hetzner" },
    } as unknown as RepoOSConfig);
    const summary = await runner.validate(opts("0001", { capabilities: ["macos"] }));
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toContain('provides only "linux"');
    expect(summary.detail).toContain("macos");
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
});

// ── prerequisite command shape ───────────────────────────────────────────────

describe("per-host prerequisite probe", () => {
  it("checks docker + the artifacts-aware validate.sh on Linux hosts", () => {
    const cmd = prereqProbeCommand("linux");
    expect(cmd).toContain("docker info");
    expect(cmd).toContain("/opt/repoos/validate.sh");
    expect(cmd).toContain("grep -qF '${3'");
    expect(cmd).toContain(PREREQ_OK_TOKEN);
    expect(cmd).not.toContain("bun not found");
  });

  it("checks the native toolchain on macOS hosts instead of docker", () => {
    const cmd = prereqProbeCommand("macos");
    expect(cmd).toContain("bun not found");
    expect(cmd).toContain("git not found");
    expect(cmd).not.toContain("docker info");
  });
});

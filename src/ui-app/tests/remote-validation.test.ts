/**
 * Remote Validation Runner (#RVR) — unit coverage for the risky bits that have
 * no other test: VM provisioning, the single-server invariant, leak
 * reconciliation, and how a remote result maps onto a CheckSummary (real test
 * failure vs. transient infra trouble).
 *
 * Everything IO is injected (fake Hetzner client, fake ssh/scp/bundle), so
 * nothing here touches a real API, network, or subprocess.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RepoOSConfig } from "../../core/types.js";
import {
  RemoteValidationRunner,
  type RemoteExecDeps,
  type RemoteExecResult,
} from "../../server/remote-validation.js";
import type { HetznerClient, HetznerServer } from "../../server/hetzner.js";

interface FakeHetznerOpts {
  /** Status sequence returned by getServer for the created server. Last value repeats. */
  statuses?: string[];
}

function fakeHetzner(opts: FakeHetznerOpts = {}) {
  const calls: string[] = [];
  let nextId = 1000;
  const servers = new Map<number, HetznerServer>();
  const statusQueue = [...(opts.statuses ?? ["running"])];

  const client: HetznerClient = {
    async createServer(o) {
      calls.push(`create:${o.name}`);
      const id = ++nextId;
      const s: HetznerServer = {
        id,
        name: o.name,
        status: "initializing",
        ipv4: "203.0.113." + (id % 250),
        created: new Date().toISOString(),
        labels: o.labels ?? {},
      };
      servers.set(id, s);
      return { ...s };
    },
    async getServer(id) {
      calls.push(`get:${id}`);
      const s = servers.get(id);
      if (!s) return null;
      const status = statusQueue.length > 1 ? statusQueue.shift()! : (statusQueue[0] ?? "running");
      s.status = status;
      return { ...s };
    },
    async deleteServer(id) {
      calls.push(`delete:${id}`);
      servers.delete(id);
    },
    async listServers() {
      calls.push("list");
      return [...servers.values()].map((s) => ({ ...s }));
    },
  };
  return { client, calls, servers };
}

function fakeExec(over: Partial<RemoteExecDeps> = {}): RemoteExecDeps {
  return {
    bundleRepo: vi.fn(async () => ({ ok: true })),
    uploadFile: vi.fn(async () => ({ ok: true })),
    downloadDir: vi.fn(async () => undefined),
    runRemote: vi.fn(async (_h, _c, onChunk): Promise<RemoteExecResult> => {
      onChunk("build ok\ntest ok\n");
      return { code: 0, output: "build ok\ntest ok\n", timedOut: false };
    }),
    probeTcp: vi.fn(async () => true),
    ...over,
  };
}

const FAST = {
  provisionPollMs: 1,
  provisionTimeoutMs: 50,
  sshProbeIntervalMs: 1,
  sshWaitTimeoutMs: 50,
  remoteRunTimeoutMs: 5_000,
};

describe("RemoteValidationRunner", () => {
  let root: string;
  let config: RepoOSConfig;

  beforeEach(() => {
    root = join(tmpdir(), `repoos-rvr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(join(root, ".repoos"), { recursive: true });
    process.env.HETZNER_API_TOKEN = "test-token";
    process.env.REPOOS_REMOTE_SSH_KEY = join(root, "key");
    writeFileSync(join(root, "key"), "PRIVATE");
    config = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      remoteValidation: {
        enabled: true,
        provider: "hetzner",
        serverType: "cpx41",
        location: "hil",
        snapshotId: "snap-123",
        sshKeyName: "k",
        idleShutdownMinutes: 999,
        maxServerLifetimeMinutes: 999,
        fallbackToLocal: false,
      },
    } as RepoOSConfig;
  });

  afterEach(async () => {
    delete process.env.HETZNER_API_TOKEN;
    delete process.env.REPOOS_REMOTE_SSH_KEY;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const mkOpts = (taskId = "0999") => ({
    taskId,
    worktreePath: root,
    candidateSha: "abc123def456",
  });
  const opts = () => mkOpts();

  it("passes when the remote gate exits 0, and writes a per-task log", async () => {
    const h = fakeHetzner();
    const exec = fakeExec();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });

    const res = await r.validate(opts());

    expect(res.ok).toBe(true);
    expect(exec.bundleRepo).toHaveBeenCalledOnce();
    expect(exec.uploadFile).toHaveBeenCalledOnce();
    expect(exec.runRemote).toHaveBeenCalledOnce();
    // validate.sh is invoked with the bundle path + the exact candidate SHA.
    const cmd = (exec.runRemote as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cmd).toContain("/opt/repoos/validate.sh");
    expect(cmd).toContain("abc123def456");
    expect(existsSync(r.logPath("0999"))).toBe(true);
    expect(readFileSync(r.logPath("0999"), "utf8")).toContain("PASSED");
    await r.dispose();
  });

  it("dispose() leaves a VM another process provisioned alone, and deletes one it created itself", async () => {
    // A warm VM recorded by the server process (shared state file).
    mkdirSync(join(root, ".repoos"), { recursive: true });
    const stateFile = join(root, ".repoos", "remote-runner.json");
    writeFileSync(
      stateFile,
      JSON.stringify({ serverId: 7, ip: "203.0.113.7", createdAt: new Date().toISOString() }),
    );
    const h = fakeHetzner();
    const adopter = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });
    await adopter.dispose();
    // Adopted, not ours: not deleted, and the server's state file survives.
    expect(h.calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
    expect(existsSync(stateFile)).toBe(true);

    // A runner that provisions its own VM still tears it down.
    rmSync(stateFile, { force: true });
    const owner = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });
    await owner.validate(opts());
    await owner.dispose();
    expect(h.calls.filter((c) => c.startsWith("delete:")).length).toBe(1);
  });

  it("a non-zero remote exit is a NON-transient failure (fix in the branch)", async () => {
    const h = fakeHetzner();
    const exec = fakeExec({
      runRemote: vi.fn(async (_h, _c, onChunk) => {
        onChunk("FAIL src/foo.test.ts > does a thing\n  expected 1 to be 2\n");
        return { code: 1, output: "FAIL src/foo.test.ts\n  expected 1 to be 2\n", timedOut: false };
      }),
    });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });

    const res = await r.validate(opts());

    expect(res.ok).toBe(false);
    expect(res.transient).toBeFalsy();
    expect(res.detail).toContain("remote validation failed");
    await r.dispose();
  });

  it("a contention-shaped remote failure is marked transient", async () => {
    const h = fakeHetzner();
    const exec = fakeExec({
      runRemote: vi.fn(async () => ({
        code: 1,
        output: "Error: worker exited unexpectedly\nJS heap out of memory\n",
        timedOut: false,
      })),
    });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });

    const res = await r.validate(opts());
    expect(res.ok).toBe(false);
    expect(res.transient).toBe(true);
    await r.dispose();
  });

  it("an ssh transport drop (exit 255) is transient infra, not a test failure", async () => {
    const h = fakeHetzner();
    const exec = fakeExec({
      runRemote: vi.fn(async () => ({
        code: 255,
        output: "ssh: connect to host 203.0.113.5 port 22: Connection timed out\n",
        timedOut: false,
      })),
    });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });

    const res = await r.validate(opts());
    expect(res.ok).toBe(false);
    expect(res.transient).toBe(true);
    expect(res.detail).toContain("unavailable");
    await r.dispose();
  });

  it("provisioning that never reaches 'running' fails transiently and deletes the half-born VM", async () => {
    const h = fakeHetzner({ statuses: ["initializing"] });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });

    const res = await r.validate(opts());

    expect(res.ok).toBe(false);
    expect(res.transient).toBe(true);
    expect(h.calls.some((c) => c.startsWith("delete:"))).toBe(true);
    expect(h.servers.size).toBe(0);
    await r.dispose();
  });

  it("SSH never coming up fails transiently and deletes the VM", async () => {
    const h = fakeHetzner();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec({ probeTcp: vi.fn(async () => false) }),
      timings: FAST,
    });

    const res = await r.validate(opts());
    expect(res.ok).toBe(false);
    expect(res.transient).toBe(true);
    expect(h.servers.size).toBe(0);
    await r.dispose();
  });

  it("two concurrent validate() calls share ONE VM", async () => {
    const h = fakeHetzner();
    let running = 0;
    let maxConcurrent = 0;
    const exec = fakeExec({
      runRemote: vi.fn(async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return { code: 0, output: "ok", timedOut: false };
      }),
    });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });

    const [a, b] = await Promise.all([r.validate(mkOpts("1001")), r.validate(mkOpts("1002"))]);

    expect(a.ok && b.ok).toBe(true);
    expect(h.calls.filter((c) => c.startsWith("create:")).length).toBe(1);
    await r.dispose();
  });

  it("cancels a run still queued at the caller's deadline instead of outliving it (#0521 spec 5)", async () => {
    const h = fakeHetzner();
    const pending: Array<(r: RemoteExecResult) => void> = [];
    const exec = fakeExec({
      runRemote: vi.fn(
        () =>
          new Promise<RemoteExecResult>((resolve) => {
            pending.push(resolve);
          }),
      ),
    });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });
    const waitUntil = async (cond: () => boolean): Promise<void> => {
      const deadline = Date.now() + 5_000;
      while (!cond()) {
        if (Date.now() > deadline) throw new Error("condition never became true");
        await new Promise((res) => setTimeout(res, 10));
      }
    };

    const first = r.validate(mkOpts("1001")); // holds the gate (limit 1)
    await waitUntil(() => pending.length >= 1);
    // The second run's caller gives up while it waits for the slot.
    const summary = await r.validate({ ...mkOpts("1002"), deadlineAt: Date.now() + 300 });
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toMatch(/deadline passed/);

    // The cancelled waiter left nothing behind: the first run finishes and the
    // gate hands its slot on normally.
    pending[0]!({ code: 0, output: "ok", timedOut: false });
    expect((await first).ok).toBe(true);
    const third = r.validate(mkOpts("1003"));
    await waitUntil(() => pending.length >= 2);
    pending[1]!({ code: 0, output: "ok", timedOut: false });
    expect((await third).ok).toBe(true);
    await r.dispose();
  });

  it("never starts a suite when the caller's deadline passed before dispatch (#0521 spec 5)", async () => {
    const h = fakeHetzner();
    const exec = fakeExec();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });
    const summary = await r.validate({ ...mkOpts(), deadlineAt: Date.now() - 1 });
    expect(summary.ok).toBe(false);
    expect(summary.transient).toBe(true);
    expect(summary.detail).toContain("deadline passed");
    expect(exec.runRemote).not.toHaveBeenCalled(); // never entered the run
    await r.dispose();
  });

  it("reconcile() deletes every labelled runner VM", async () => {
    const h = fakeHetzner();
    // Pretend two runners leaked from an earlier crash.
    await h.client.createServer({
      name: "repoos-ci-old1",
      serverType: "x",
      location: "y",
      image: "z",
      sshKeyNames: [],
      labels: { "repoos-ci": "1" },
    });
    await h.client.createServer({
      name: "repoos-ci-old2",
      serverType: "x",
      location: "y",
      image: "z",
      sshKeyNames: [],
      labels: { "repoos-ci": "1" },
    });
    expect(h.servers.size).toBe(2);

    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });
    await r.reconcile();

    expect(h.servers.size).toBe(0);
  });

  it("is disabled without a token / snapshot / key", async () => {
    delete process.env.HETZNER_API_TOKEN;
    const h = fakeHetzner();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });
    const res = await r.validate(opts());
    expect(res.ok).toBe(false);
    expect(res.transient).toBe(true);
    expect(h.calls.some((c) => c.startsWith("create:"))).toBe(false);
  });
});

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
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RepoOSConfig } from "../../core/types.js";
import { getCheckStore, resetCheckStore } from "../../core/check-store.js";
import {
  RemoteValidationRunner,
  EMPTY_REMOTE_MIRROR,
  prepareCandidateUpload,
  parseMirrorProbeOutput,
  defaultRemoteExec,
  remoteMirrorPath,
  type RemoteExecDeps,
  type RemoteExecResult,
  type RemoteHost,
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
    probeMirror: vi.fn(async () => EMPTY_REMOTE_MIRROR),
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
  /** HEAD of the throwaway repo at `root`, the real sha runs are bundled from (#0717). */
  let headSha: string;

  beforeEach(() => {
    root = join(tmpdir(), `repoos-rvr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(join(root, ".repoos"), { recursive: true });
    // #0717: a run stages the candidate under a per-run ref in the worktree and
    // bundles it, so the worktree must be a real git repo with that commit.
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, "f.txt"), "one\n");
    execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: root, stdio: "ignore" });
    headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    process.env.HETZNER_API_TOKEN = "test-token";
    process.env.REPOOS_REMOTE_SSH_KEY = join(root, "key");
    // These fixtures assert on their own tmp-root store; an inherited
    // REPOOS_CHECK_STORE_ROOT (a `repoos check` parent exports it) would
    // silently redirect the history rows.
    delete process.env.REPOOS_CHECK_STORE_ROOT;
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
    delete process.env.REPOOS_CHECK_STORE_ROOT;
    resetCheckStore();
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const mkOpts = (taskId = "0999") => ({
    taskId,
    worktreePath: root,
    candidateSha: headSha,
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
    expect(cmd).toContain(headSha);
    expect(existsSync(r.logPath("0999"))).toBe(true);
    expect(readFileSync(r.logPath("0999"), "utf8")).toContain("PASSED");
    await r.dispose();
  });

  it("warns and uses full-suite mode when changed ref does not resolve (#0695)", async () => {
    const h = fakeHetzner();
    const chunks: string[] = [];
    const exec = fakeExec({
      runRemote: vi.fn(async (_h, _c, onChunk): Promise<RemoteExecResult> => {
        onChunk("ok\n");
        return { code: 0, output: "ok\n", timedOut: false };
      }),
    });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });
    const res = await r.validate({
      ...opts(),
      changedRef: "not-a-real-ref-xyz",
      onChunk: (c) => chunks.push(c),
    });
    expect(res.ok).toBe(true);
    expect(res.remoteTestScopeRef).toBeUndefined();
    const cmd = (exec.runRemote as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cmd).not.toContain("not-a-real-ref-xyz");
    expect(chunks.join("")).toMatch(/WARNING:.*full suite/i);
    await r.dispose();
  });

  it("bundles the changed ref and passes it to validate.sh (#0695)", async () => {
    const h = fakeHetzner();
    const exec = fakeExec();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });

    const res = await r.validate({ ...opts(), changedRef: "main" });

    expect(res.ok).toBe(true);
    expect(exec.bundleRepo).toHaveBeenCalledOnce();
    const bundleOpts = (exec.bundleRepo as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as {
      refs?: string[];
    };
    // Candidate + scope ref travel together so the runner can run `--changed`.
    expect(bundleOpts?.refs?.some((ref) => ref.startsWith("refs/repoos/candidate"))).toBe(true);
    expect(bundleOpts?.refs?.some((ref) => ref.startsWith("refs/repoos/scope"))).toBe(true);
    const cmd = (exec.runRemote as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cmd).toContain("main");
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

  it("a deadline passing mid-dispatch is a CANCELLED history row, not a fail (#0564 review)", async () => {
    const h = fakeHetzner();
    // The bundle step is where the deadline expires: it takes just long
    // enough that the slot is already held and a runner VM chosen when the
    // caller's deadline passes. This used to be recorded as `fail` with
    // failedStep "remote-validation" — the Runs tab would show a cancelled
    // gate as a branch failure.
    const exec = fakeExec({
      bundleRepo: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true };
      }),
    });
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec,
      timings: FAST,
    });

    const summary = await r.validate({ ...mkOpts("0564"), deadlineAt: Date.now() + 15 });

    expect(summary.ok).toBe(false);
    expect(summary.cancelled).toBe(true);
    expect(exec.runRemote).not.toHaveBeenCalled(); // the suite never started

    const rows = getCheckStore(config.root, config.cacheDir).list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taskId: "0564",
      remote: true,
      outcome: "cancelled",
      durationMs: null,
    });
    expect(rows[0]!.machine).toBeTruthy(); // a runner VM WAS chosen before the cancel
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

  // ── structured per-task events (#0568) ────────────────────────────────────

  it("records structured events for a passing run, with host and exit code (#0568)", async () => {
    const h = fakeHetzner();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });

    await r.validate(opts());

    const events = r.remoteEvents("0999");
    expect(events.some((e) => e.phase === "run")).toBe(true);
    const result = events.find((e) => e.phase === "result");
    expect(result?.exitCode).toBe(0);
    expect(result?.level).toBe("info");
    expect(result?.host).toBeTruthy();
    await r.dispose();
  });

  it("records an infra event with host and exit code when the ssh transport drops (#0568)", async () => {
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

    await r.validate(opts());

    const ev = r.remoteEvents("0999").find((e) => e.infra);
    expect(ev).toBeTruthy();
    expect(ev?.exitCode).toBe(255);
    expect(ev?.host).toBeTruthy();
    expect(ev?.message).toContain("ssh connection");
    await r.dispose();
  });

  it("records a config error event when the runner cannot satisfy the job (#0568)", async () => {
    const h = fakeHetzner();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });

    const res = await r.validate({ ...opts(), capabilities: ["macos"] });

    expect(res.configError).toBe(true);
    const ev = r.remoteEvents("0999").find((e) => e.configError);
    expect(ev).toBeTruthy();
    expect(ev?.level).toBe("error");
    expect(ev?.message).toContain("cannot run");
    await r.dispose();
  });

  it("records a dispatch event when the caller's deadline passed before the run (#0568)", async () => {
    const h = fakeHetzner();
    const r = new RemoteValidationRunner(config, undefined, {
      hetzner: h.client,
      exec: fakeExec(),
      timings: FAST,
    });

    await r.validate({ ...opts(), deadlineAt: Date.now() - 1 });

    const ev = r.remoteEvents("0999").find((e) => e.infra && e.phase === "dispatch");
    expect(ev).toBeTruthy();
    expect(ev?.message).toContain("deadline passed");
    await r.dispose();
  });
});

/**
 * Incremental candidate upload (#0717): every remote run used to upload the
 * full ~100 MB history bundle. With a persistent mirror on the host that holds
 * a base the candidate descends from, only `<base>..HEAD` travels.
 */
describe("prepareCandidateUpload (#0717)", () => {
  const HOST: RemoteHost = { ip: "203.0.113.9", user: "root" };
  const MIRROR = "~/.repoos-cache/repo-deadbeef.git";

  /** A real git repo with `base` → `candidate` on top, plus a sibling history. */
  function makeRepo(): { root: string; baseSha: string; candidateSha: string } {
    const root = mkdtempSync(join(tmpdir(), "repoos-0717-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    writeFileSync(join(root, "f.txt"), "one\n");
    git("add", ".");
    git("commit", "-qm", "base");
    const baseSha = git("rev-parse", "HEAD");
    // A commit that makes the full history noticeably bigger than the delta.
    writeFileSync(join(root, "big.txt"), randomBytes(20_000).toString("hex"));
    git("add", ".");
    git("commit", "-qm", "fill");
    writeFileSync(join(root, "f.txt"), "two\n");
    git("add", ".");
    git("commit", "-qm", "candidate");
    const candidateSha = git("rev-parse", "HEAD");
    return { root, baseSha, candidateSha };
  }

  function listBundleRefs(bundlePath: string): string[] {
    return execFileSync("git", ["bundle", "list-heads", bundlePath], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split(/\s+/)[1]);
  }

  /** A fake exec whose bundling is the real `git bundle create` (#0717). */
  function realBundleExec(over: Partial<RemoteExecDeps> = {}): RemoteExecDeps {
    const real = defaultRemoteExec().bundleRepo;
    return fakeExec({ bundleRepo: vi.fn((cwd, out, o) => real(cwd, out, o)), ...over });
  }

  it("bundles only the new commits when the host holds the candidate's base", async () => {
    const { root, baseSha, candidateSha } = makeRepo();
    try {
      const bundlePath = join(root, "candidate.bundle");
      // A real `git bundle create` (defaultRemoteExec), so the excludeRefs
      // handling is exercised against actual git semantics, not just mocked.
      const exec = realBundleExec({
        probeMirror: vi.fn(async () => ({
          exists: true,
          refs: { "refs/repoos/candidate": baseSha },
        })),
      });
      const res = await prepareCandidateUpload(exec, {
        host: HOST,
        bundlePath,
        remoteBundle: "~/.repoos-x.bundle",
        worktreePath: root,
        candidateSha,
        mirrorPath: MIRROR,
        emit: () => {},
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.partial).toBe(true);
      expect(res.baseSha).toBe(baseSha);
      // The bundle records the candidate ref but excludes the base commits:
      // `git bundle verify` proves the base is a prerequisite (must exist on
      // the host mirror), not carried in the bundle.
      const refs = listBundleRefs(bundlePath);
      expect(refs.some((r) => r.startsWith("refs/repoos/candidate"))).toBe(true);
      const verify = execFileSync("git", ["bundle", "verify", bundlePath], {
        cwd: root,
        encoding: "utf8",
      });
      expect(verify).toContain(baseSha);
      // The partial bundle is far smaller than the full-history one, and
      // smaller than the 200 KB payload commit it does not need to send.
      const fullPath = join(root, "full.bundle");
      execFileSync("git", ["bundle", "create", fullPath, "HEAD"], { cwd: root });
      expect(res.bundleBytes).toBeLessThan(statSync(fullPath).size);
      expect(res.bundleBytes).toBeLessThan(statSync(join(root, "big.txt")).size);
      expect(res.uploadSecs).toBeGreaterThanOrEqual(0);

      const bundleOpts = (exec.bundleRepo as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as {
        refs?: string[];
        excludeRefs?: string[];
      };
      expect(bundleOpts?.excludeRefs).toEqual([baseSha]);
      expect(bundleOpts?.refs?.some((r) => r.startsWith("refs/repoos/candidate"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to the full bundle when the host reports no mirror", async () => {
    const { root, candidateSha } = makeRepo();
    try {
      const bundlePath = join(root, "candidate.bundle");
      const exec = realBundleExec(); // probeMirror defaults to EMPTY_REMOTE_MIRROR
      const res = await prepareCandidateUpload(exec, {
        host: HOST,
        bundlePath,
        remoteBundle: "~/.repoos-x.bundle",
        worktreePath: root,
        candidateSha,
        mirrorPath: MIRROR,
        emit: () => {},
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.partial).toBe(false);
      expect(res.baseSha).toBeNull();
      const bundleOpts = (exec.bundleRepo as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as {
        excludeRefs?: string[];
      };
      expect(bundleOpts?.excludeRefs).toEqual([]);
      // A full-history bundle carries the base too.
      const refs = listBundleRefs(bundlePath);
      expect(refs.some((r) => r.startsWith("refs/repoos/candidate"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never excludes a base the candidate does not descend from", async () => {
    const { root, candidateSha } = makeRepo();
    try {
      // An unrelated commit on the host mirror (a sibling line the candidate
      // does not contain). Excluding it would drop commits the bundle needs.
      execFileSync("git", ["checkout", "-q", "-b", "side", candidateSha], { cwd: root });
      writeFileSync(join(root, "side.txt"), "side\n");
      execFileSync("git", ["add", "."], { cwd: root });
      execFileSync("git", ["commit", "-qm", "side"], { cwd: root });
      const unrelated = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      execFileSync("git", ["checkout", "-q", "main"], { cwd: root });
      const exec = realBundleExec({
        probeMirror: vi.fn(async () => ({
          exists: true,
          refs: { "refs/repoos/scope": unrelated },
        })),
      });
      const bundlePath = join(root, "candidate.bundle");
      const res = await prepareCandidateUpload(exec, {
        host: HOST,
        bundlePath,
        remoteBundle: "~/.repoos-x.bundle",
        worktreePath: root,
        candidateSha,
        mirrorPath: MIRROR,
        emit: () => {},
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.partial).toBe(false);
      expect(res.baseSha).toBeNull();
      const bundleOpts = (exec.bundleRepo as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as {
        excludeRefs?: string[];
      };
      expect(bundleOpts?.excludeRefs).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ships the scope ref while still excluding a base the host holds", async () => {
    const { root, baseSha, candidateSha } = makeRepo();
    try {
      // The scope tip (main) is the middle commit: a strict descendant of the
      // host's base and a strict ancestor of the candidate.
      const scopeTip = execFileSync("git", ["rev-parse", `${candidateSha}^`], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      const bundlePath = join(root, "candidate.bundle");
      const exec = realBundleExec({
        probeMirror: vi.fn(async () => ({
          exists: true,
          refs: { "refs/repoos/candidate": baseSha, "refs/repoos/scope": scopeTip },
        })),
      });
      const res = await prepareCandidateUpload(exec, {
        host: HOST,
        bundlePath,
        remoteBundle: "~/.repoos-x.bundle",
        worktreePath: root,
        candidateSha,
        changedRef: "main",
        changedBaseSha: scopeTip,
        mirrorPath: MIRROR,
        emit: () => {},
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // The base is a strict ancestor of both the candidate and the scope tip,
      // so a partial bundle is safe AND the scope ref travels alongside it.
      expect(res.partial).toBe(true);
      expect(res.baseSha).toBe(baseSha);
      const refs = listBundleRefs(bundlePath);
      expect(refs.some((r) => r.startsWith("refs/repoos/candidate"))).toBe(true);
      expect(refs.some((r) => r.startsWith("refs/repoos/scope"))).toBe(true);
      const bundleOpts = (exec.bundleRepo as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as {
        refs?: string[];
        excludeRefs?: string[];
      };
      expect(bundleOpts?.refs?.some((r) => r.startsWith("refs/repoos/scope"))).toBe(true);
      expect(bundleOpts?.excludeRefs).toEqual([baseSha]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not exclude a base equal to the scope tip (it would drop the scope ref)", async () => {
    const { root, baseSha, candidateSha } = makeRepo();
    try {
      const bundlePath = join(root, "candidate.bundle");
      // The host's only base IS the scope tip: excluding it would also exclude
      // the scope ref the runner needs, so the run must fall back to full.
      const exec = realBundleExec({
        probeMirror: vi.fn(async () => ({
          exists: true,
          refs: { "refs/repoos/candidate": baseSha },
        })),
      });
      const res = await prepareCandidateUpload(exec, {
        host: HOST,
        bundlePath,
        remoteBundle: "~/.repoos-x.bundle",
        worktreePath: root,
        candidateSha,
        changedRef: "main",
        changedBaseSha: baseSha,
        mirrorPath: MIRROR,
        emit: () => {},
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.baseSha).toBeNull();
      expect(res.partial).toBe(false);
      // The scope ref is still carried, so `--changed main` resolves.
      const refs = listBundleRefs(bundlePath);
      expect(refs.some((r) => r.startsWith("refs/repoos/scope"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retries the upload instead of losing the whole run", async () => {
    const { root, candidateSha } = makeRepo();
    try {
      const bundlePath = join(root, "candidate.bundle");
      let calls = 0;
      const exec = fakeExec({
        uploadFile: vi.fn(async () => {
          calls++;
          return calls < 2 ? { ok: false, detail: "EPIPE" } : { ok: true };
        }),
      });
      const res = await prepareCandidateUpload(exec, {
        host: HOST,
        bundlePath,
        remoteBundle: "~/.repoos-x.bundle",
        worktreePath: root,
        candidateSha,
        mirrorPath: MIRROR,
        emit: () => {},
      });
      expect(res.ok).toBe(true);
      expect(calls).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a partial bundle applies only to a mirror that holds its base (validate.sh contract)", async () => {
    const { root, baseSha, candidateSha } = makeRepo();
    try {
      // Build the partial bundle exactly as prepareCandidateUpload would.
      const bundlePath = join(root, "candidate.bundle");
      execFileSync("git", ["update-ref", "refs/repoos/candidate-x", candidateSha], { cwd: root });
      execFileSync("git", ["bundle", "create", bundlePath, "refs/repoos/candidate-x", `^${baseSha}`], {
        cwd: root,
      });

      // A fresh mirror (no base) cannot apply the partial bundle — this is the
      // fetch validate.sh does; it must fail rather than silently produce a
      // wrong tree, so RepoOS falls back to the full bundle on the next run.
      const fresh = join(root, "fresh.git");
      execFileSync("git", ["init", "-q", "--bare", fresh]);
      const failed = (() => {
        try {
          execFileSync(
            "git",
            [
              "-C",
              fresh,
              "fetch",
              "-q",
              "--no-tags",
              "--force",
              bundlePath,
              "+refs/repoos/candidate-x:refs/repoos/candidate",
            ],
            { stdio: "pipe" },
          );
          return false;
        } catch {
          return true;
        }
      })();
      expect(failed).toBe(true);

      // A mirror that already holds the base applies it and lands on the
      // candidate — and a wrong expected sha is detectable by rev-parse.
      const warm = join(root, "warm.git");
      execFileSync("git", ["init", "-q", "--bare", warm]);
      execFileSync("git", ["-C", warm, "fetch", "-q", root, baseSha], { stdio: "pipe" });
      execFileSync(
        "git",
        [
          "-C",
          warm,
          "fetch",
          "-q",
          "--no-tags",
          "--force",
          bundlePath,
          "+refs/repoos/candidate-x:refs/repoos/candidate",
        ],
        { stdio: "pipe" },
      );
      const mirrorSha = execFileSync(
        "git",
        ["-C", warm, "rev-parse", "--verify", "refs/repoos/candidate"],
        { encoding: "utf8" },
      ).trim();
      expect(mirrorSha).toBe(candidateSha);
      expect(mirrorSha).not.toBe(baseSha);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports the upload as failed (hostGone) after exhausting retries", async () => {
    const { root, candidateSha } = makeRepo();
    try {
      const bundlePath = join(root, "candidate.bundle");
      const exec = fakeExec({
        uploadFile: vi.fn(async () => ({ ok: false, detail: "Broken pipe" })),
      });
      const res = await prepareCandidateUpload(exec, {
        host: HOST,
        bundlePath,
        remoteBundle: "~/.repoos-x.bundle",
        worktreePath: root,
        candidateSha,
        mirrorPath: MIRROR,
        emit: () => {},
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.stage).toBe("upload");
      expect(res.hostGone).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("remote mirror helpers (#0717)", () => {
  it("parses a MIRROR=1 probe with both refs", () => {
    const out =
      "MIRROR=1\n" + "a".repeat(40) + "\n" + "b".repeat(40) + "\n";
    const state = parseMirrorProbeOutput(out);
    expect(state.exists).toBe(true);
    expect(state.refs["refs/repoos/candidate"]).toBe("a".repeat(40));
    expect(state.refs["refs/repoos/scope"]).toBe("b".repeat(40));
  });

  it("treats a missing mirror or a failed probe as no mirror", () => {
    expect(parseMirrorProbeOutput("MIRROR=0").exists).toBe(false);
    expect(parseMirrorProbeOutput("").exists).toBe(false);
    expect(EMPTY_REMOTE_MIRROR).toEqual({ exists: false, refs: {} });
  });

  it("derives a stable, distinct mirror path per repo root", () => {
    const a = remoteMirrorPath("/Users/x/opex");
    const b = remoteMirrorPath("/Users/y/opex");
    expect(a).toMatch(/^~\/\.repoos-cache\/opex-[0-9a-f]{8}\.git$/);
    expect(a).not.toBe(b);
    expect(remoteMirrorPath("/Users/x/opex")).toBe(a);
  });
});

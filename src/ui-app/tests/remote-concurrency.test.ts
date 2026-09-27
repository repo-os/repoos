/**
 * Remote runs are queued and isolated (#0520): a FIFO concurrency limit so two
 * full suites never share one machine, and per-run bundle/artifact paths so
 * overlapping runs never wipe each other's logs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import { loadConfig } from "../../core/config.js";
import {
  ConcurrencyGate,
  TailscaleRunner,
  remoteConcurrencyLimit,
  remoteRunPaths,
  type RemoteExecDeps,
  type RemoteExecResult,
} from "../../server/remote-validation.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("ConcurrencyGate", () => {
  it("runs one at a time by default and hands the slot to waiters in FIFO order", async () => {
    const gate = new ConcurrencyGate(1);
    const order: string[] = [];
    const first = await gate.acquire();
    const queued: number[] = [];
    const second = gate
      .acquire((ahead) => queued.push(ahead))
      .then((release) => {
        order.push("second");
        return release;
      });
    const third = gate
      .acquire((ahead) => queued.push(ahead))
      .then((release) => {
        order.push("third");
        return release;
      });
    await Promise.resolve();
    expect(order).toEqual([]);
    // Each late arrival is told how many runs it queued behind.
    expect(queued).toEqual([1, 2]);
    expect(gate.pending).toBe(3);

    first();
    (await second)();
    (await third)();
    expect(order).toEqual(["second", "third"]);
    expect(gate.pending).toBe(0);
  });

  it("allows `limit` runs at once and never overshoots on a burst", async () => {
    const gate = new ConcurrencyGate(2);
    let running = 0;
    let peak = 0;
    const job = async (): Promise<void> => {
      const release = await gate.acquire();
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      release();
    };
    await Promise.all(Array.from({ length: 8 }, job));
    expect(peak).toBe(2);
  });

  it("ignores a second release of the same slot", async () => {
    const gate = new ConcurrencyGate(1);
    const release = await gate.acquire();
    release();
    release();
    const other = await gate.acquire();
    // If the double release had freed a phantom slot this would not queue.
    let queuedBehind = -1;
    const next = gate.acquire((n) => (queuedBehind = n));
    expect(queuedBehind).toBe(1);
    other();
    (await next)();
  });
});

describe("remote run paths and limit", () => {
  it("gives every run its own bundle and artifacts dir, even for the same task", () => {
    const a = remoteRunPaths("0520");
    const b = remoteRunPaths("0520");
    expect(a.bundle).not.toBe(b.bundle);
    expect(a.artifacts).not.toBe(b.artifacts);
    expect(a.artifacts.startsWith("/tmp/repoos-artifacts/0520-")).toBe(true);
  });

  it("keeps paths shell-safe for synthetic task ids", () => {
    const p = remoteRunPaths("weird id; rm -rf /", "abc");
    expect(p.bundle).toBe("/tmp/repoos-weird_id__rm_-rf__-abc.bundle");
    expect(p.artifacts).not.toMatch(/[\s;]/);
  });

  it("defaults to one run at a time and accepts only positive integers", () => {
    const cfg = (maxConcurrent?: unknown) =>
      ({ remoteValidation: { enabled: true, maxConcurrent } }) as unknown as RepoOSConfig;
    expect(remoteConcurrencyLimit(cfg())).toBe(1);
    expect(remoteConcurrencyLimit(cfg(3))).toBe(3);
    expect(remoteConcurrencyLimit(cfg(0))).toBe(1);
    expect(remoteConcurrencyLimit(cfg(1.5))).toBe(1);
    expect(remoteConcurrencyLimit(cfg("2"))).toBe(1);
  });

  it("reads remoteValidation.maxConcurrent from repoos.toml", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rv-conc-"));
    dirs.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(
      join(root, "repoos.toml"),
      'workDir = "work"\n[remoteValidation]\nenabled = true\nmaxConcurrent = 3\n',
    );
    expect(loadConfig(root).remoteValidation?.maxConcurrent).toBe(3);
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n');
    expect(loadConfig(root).remoteValidation?.maxConcurrent).toBe(1);
  });
});

describe("TailscaleRunner queueing and isolation", () => {
  function fixture(maxConcurrent?: number) {
    const root = mkdtempSync(join(tmpdir(), "repoos-rv-ts-"));
    dirs.push(root);
    const config = {
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
        provider: "tailscale",
        tailscaleHost: "mini",
        maxConcurrent,
      },
    } as unknown as RepoOSConfig;
    const cmds: string[] = [];
    const downloads: string[] = [];
    const uploads: string[] = [];
    let inFlight = 0;
    let peak = 0;
    const gates: Array<() => void> = [];
    const exec: RemoteExecDeps = {
      bundleRepo: vi.fn(async () => ({ ok: true })),
      uploadFile: vi.fn(async (_h, _l, remote: string) => {
        uploads.push(remote);
        return { ok: true };
      }),
      downloadDir: vi.fn(async (_h, remoteGlob: string) => {
        downloads.push(remoteGlob);
      }),
      runRemote: vi.fn(async (_h, cmd: string): Promise<RemoteExecResult> => {
        cmds.push(cmd);
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => gates.push(resolve));
        inFlight--;
        return { code: 0, output: "ok", timedOut: false };
      }),
      probeTcp: vi.fn(async () => true),
    };
    return {
      runner: new TailscaleRunner(config, undefined, { exec }),
      cmds,
      downloads,
      uploads,
      gates,
      peak: () => peak,
    };
  }
  const opts = (taskId: string, onChunk?: (c: string) => void) => ({
    taskId,
    worktreePath: "/nonexistent",
    candidateSha: "abc123def456",
    onChunk,
  });
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it("queues a second run behind the first (default limit 1) and says so in its log", async () => {
    const f = fixture();
    const chunks: string[] = [];
    const a = f.runner.validate(opts("0001"));
    await tick();
    const b = f.runner.validate(opts("0002", (c) => chunks.push(c)));
    await tick();
    // The second run has not reached the runner yet.
    expect(f.cmds).toHaveLength(1);
    expect(chunks.join("")).toContain("queued behind 1 other remote run(s)");

    f.gates[0]!();
    await tick();
    await a;
    expect(f.cmds).toHaveLength(2);
    f.gates[1]!();
    await b;
    expect(f.peak()).toBe(1);
  });

  it("runs two at once when maxConcurrent = 2", async () => {
    const f = fixture(2);
    const a = f.runner.validate(opts("0001"));
    const b = f.runner.validate(opts("0002"));
    await tick();
    await tick();
    expect(f.cmds).toHaveLength(2);
    f.gates.forEach((g) => g());
    await Promise.all([a, b]);
    expect(f.peak()).toBe(2);
  });

  it("gives each run its own artifacts dir and downloads only that one", async () => {
    const f = fixture(2);
    const a = f.runner.validate(opts("0001"));
    const b = f.runner.validate(opts("0001"));
    await tick();
    await tick();
    f.gates.forEach((g) => g());
    await Promise.all([a, b]);

    const artifacts = f.cmds.map((c) => c.trim().split(/\s+/).pop()!);
    expect(new Set(artifacts).size).toBe(2);
    for (const dir of artifacts) expect(dir.startsWith("/tmp/repoos-artifacts/0001-")).toBe(true);
    // Each download targets exactly that run's directory.
    expect(f.downloads.sort()).toEqual(artifacts.map((d) => `${d}/*`).sort());
    expect(new Set(f.uploads).size).toBe(2);
  });
});
